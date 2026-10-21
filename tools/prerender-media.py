"""Render site media from an exported scene and encode forward/reverse clips.

Requirements: Node.js, Python with Pillow, system EGL/OpenGL 4.5 (Mesa), and FFmpeg
with libx264 and libaom-av1. No browser or display server is needed. Raw frames
stay outside the served repository. LP_NUM_THREADS limits Mesa worker threads.

  node --experimental-default-type=module tools/prerender-scene.mjs /tmp/site-render
  LP_NUM_THREADS=8 python tools/prerender-media.py --work /tmp/site-render --output media

Use --ffmpeg /path/to/ffmpeg (or FFMPEG_BINARY) for a non-system encoder. The
optional imageio-ffmpeg Python package supplies a suitable executable; it need
not be installed in the website or the host's global Python environment.

Rendering is resumable when scene and quality settings match. --force invalidates
old cached frames before starting a new generation. --encode-only reuses a
completed render without creating a GL context. Default video output is 1920x960,
rendered at 2880x1440 and Lanczos-downsampled. Each route contains duration * 60 + 1 frames: the exact destination is at
PTS duration and the container lasts one frame longer. Reverse clips reuse the same frames backwards. A closing-loop rewind
renders its own exported camera poses, preserving the main routes and posters.
Portrait files are exact
center crops with the same vertical field of view.
"""
import argparse
import concurrent.futures
import hashlib
import importlib.util
import json
import os
import subprocess
import time
from pathlib import Path
from PIL import Image


def portrait_width(height):
    return (height * 3 // 4) // 2 * 2


def save_image(image, path):
    temporary = path.with_name('.' + path.stem + '.partial' + path.suffix)
    if path.suffix == '.webp':
        image.save(temporary, quality=96, method=6)
    else:
        image.save(temporary, compress_level=1)
    temporary.replace(path)


def crop_portrait(image):
    width, height = image.size
    cropped_width = portrait_width(height)
    left = (width - cropped_width) // 2
    return image.crop((left, 0, left + cropped_width, height))


def encode(source, output, fps, codec, frame_count, *, ffmpeg='ffmpeg',
           threads=2, portrait=False, width=1920, height=960):
    # Two-pass allocation preserves the intricate endpoint views at modest size.
    rate = 1_500_000 if portrait else 4_000_000
    filters = ['format=' + ('yuv420p' if codec == 'mp4' else 'yuv420p10le')]
    if portrait:
        cropped_width = portrait_width(height)
        filters.insert(0, f'crop={cropped_width}:{height}:{(width-cropped_width)//2}:0')
    record = dict(version=3, codec=codec, rate=rate, fps=fps, frames=frame_count,
                  portrait=portrait, width=width, height=height,
                  keyframeInterval=min(frame_count-1,round(8*fps)),
                  cpuUsed=2 if codec=='webm' else None,
                  firstPassCpuUsed=6 if codec=='webm' else None)
    # Store provenance beside raw frames, outside the served website. Completed
    # files are reused only when settings AND their content digest still match.
    cache = source.parent.parent / 'encoding-cache'
    cache.mkdir(exist_ok=True)
    provenance = cache / (output.name + '.json')
    record['sourceSha256'] = hashlib.sha256(b''.join(
        hashlib.sha256((source / f'{i:04d}.png').read_bytes()).digest()
        for i in range(frame_count))).hexdigest()
    if output.exists() and provenance.exists():
        previous = json.loads(provenance.read_text())
        if previous.get('settings') == record and previous.get('sha256') == hashlib.sha256(output.read_bytes()).hexdigest():
            print(f'Reusing {output.name}', flush=True)
            return
    common = [ffmpeg, '-hide_banner', '-loglevel', 'warning', '-y',
              '-framerate', str(fps), '-i', str(source / '%04d.png'), '-an',
              '-frames:v', str(frame_count), '-vf', ','.join(filters),
              '-threads', str(threads), '-b:v', str(rate), '-g', str(min(frame_count-1,round(8*fps))),
              '-passlogfile', str(cache / output.name),
              '-progress', str(cache / (output.name + '.progress'))]
    temporary = output.with_name('.' + output.stem + '.partial' + output.suffix)
    with (cache / (output.name + '.log')).open('w') as log:
        for pass_number in [1, 2]:
            if codec == 'mp4':
                margin = round(1.5 * fps)
                zones = f'0,{margin},b=2.5/{frame_count-1-margin},{frame_count-1},b=2.5'
                options = ['-c:v', 'libx264', '-preset', 'veryslow',
                           '-profile:v', 'high', '-refs', '4', '-level:v', '3.2' if portrait else '4.2', '-maxrate', str(rate*2),
                           '-bufsize', str(rate*2), '-sc_threshold', '0',
                           '-x264-params', 'zones=' + zones]
            else:
                options = ['-c:v', 'libaom-av1', '-cpu-used', '6' if pass_number == 1 else '2',
                           '-row-mt', '1', '-tiles', '2x1', '-lag-in-frames', '35']
            destination = ['-f', 'null', '/dev/null'] if pass_number == 1 else (
                ['-movflags', '+faststart', str(temporary)] if codec == 'mp4' else [str(temporary)])
            print(f'{output.name}: pass {pass_number}', flush=True)
            subprocess.run(common + options + ['-pass', str(pass_number)] + destination,
                           stdout=log, stderr=log, check=True)
    temporary.replace(output)
    provenance.write_text(json.dumps({'settings': record,
        'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}, indent=2) + '\n')
    print(f'{output.name}: {output.stat().st_size/1e6:.2f} MB', flush=True)


def encode_leg(work, output, scene, leg, *, ffmpeg='ffmpeg', threads=2,
               width=1920, height=960, jobs=1):
    frames = scene['legs'][leg]
    directory = work / 'frames' / f'leg-{leg}'
    for i in range(len(frames)):
        if not (directory / f'{i:04d}.png').is_file():
            raise RuntimeError(f'Incomplete leg {leg}: frame {i} is missing')
    reverse = work / 'frames' / f'leg-{leg}-reverse'
    reverse.mkdir(parents=True, exist_ok=True)
    for i in range(len(frames)):
        target = reverse / f'{i:04d}.png'
        original = directory / f'{len(frames)-1-i:04d}.png'
        target.unlink(missing_ok=True)
        os.link(original, target)
    encoding_jobs = []
    for direction, source in [('forward', directory), ('reverse', reverse)]:
        for portrait in [False, True]:
            suffix = '-portrait' if portrait else ''
            for codec in ['mp4', 'webm']:
                path = output / f'transition-{leg}-{direction}{suffix}.{codec}'
                print(f'Encoding {path.name}', flush=True)
                encoding_jobs.append((source, path, codec, portrait))
    with concurrent.futures.ThreadPoolExecutor(max_workers=jobs) as pool:
        futures = [pool.submit(encode, source, path, scene['fps'], codec, len(frames),
                   ffmpeg=ffmpeg, threads=threads, portrait=portrait, width=width, height=height)
                   for source, path, codec, portrait in encoding_jobs]
        for future in futures:
            future.result()


def prepare_rewind(work, scene):
    """Return closing-loop sources, or legacy reverse-route hard links."""
    frames = scene['rewind']
    if scene.get('rewindKind') == 'closing-loop':
        directory = work / 'frames' / 'rewind'
        for i in range(len(frames)):
            if not (directory / f'{i:04d}.png').is_file():
                raise RuntimeError(f'Closing-loop frame {i} has not been rendered')
        return directory
    intervals = scene['intervals']
    if len(scene['legs']) != 3 or len(frames) != intervals + 1:
        raise ValueError('Rewind requires three equal-duration legs and one transition duration.')
    directory = work / 'frames' / 'rewind'
    directory.mkdir(parents=True, exist_ok=True)
    for i, frame in enumerate(frames):
        source_index = 3 * i
        segment = min(2, source_index // intervals)
        leg = 2 - segment
        local_index = source_index - segment * intervals
        index = intervals - local_index
        original_frame = scene['legs'][leg][index]
        # Exported timing is authoritative: refuse reuse if it describes a
        # different camera. Roundoff in the symmetric easing is harmless.
        if frame['cell'] != original_frame['cell'] or any(
                abs(a-b) > 1e-9 for a, b in zip(frame['camera'], original_frame['camera'])):
            raise ValueError(f'Rewind sample {i} disagrees with source leg {leg}, frame {index}')
        original = work / 'frames' / f'leg-{leg}' / f'{index:04d}.png'
        if not original.is_file():
            raise RuntimeError(f'Rewind source is missing: {original}')
        target = directory / f'{i:04d}.png'
        target.unlink(missing_ok=True)
        os.link(original, target)
    return directory


def encode_rewind(work, output, scene, *, ffmpeg='ffmpeg', threads=4,
                  width=1920, height=960, jobs=1):
    directory = prepare_rewind(work, scene)
    with concurrent.futures.ThreadPoolExecutor(max_workers=jobs) as pool:
        futures = [pool.submit(encode, directory,
                   output / f"rewind{'-portrait' if portrait else ''}.{codec}",
                   scene['fps'], codec, len(scene['rewind']), ffmpeg=ffmpeg,
                   threads=threads, portrait=portrait, width=width, height=height)
                   for portrait in [False, True] for codec in ['mp4', 'webm']]
        for future in futures:
            future.result()


def write_manifest(work, output, scene, settings, ffmpeg):
    width, height = settings['width'], settings['height']
    expected = [f'station-{i}{suffix}.webp' for i in range(len(scene['stations']))
                for suffix in ['', '-portrait']]
    expected += [f'transition-{leg}-{direction}{suffix}.{codec}'
                 for leg in range(len(scene['legs'])) for direction in ['forward', 'reverse']
                 for suffix in ['', '-portrait'] for codec in ['mp4', 'webm']]
    expected += [f'rewind{suffix}.{codec}' for suffix in ['', '-portrait'] for codec in ['mp4', 'webm']]
    for name in expected:
        if not (output / name).is_file():
            raise RuntimeError(f'Cannot finalize incomplete media: {name} is missing')
    manifest = {
        'version': 2, 'width': width, 'height': height, 'aspectRatio': width / height,
        'portraitWidth': portrait_width(height), 'portraitHeight': height,
        'fps': scene['fps'],
        'fieldScale': .82, 'beamRadius': .025, 'sceneSha256': settings['sceneSha256'],
        'geometryPrecision': scene.get('precision', 'float32'),
        'colorPrecision': 'float32', 'tubeDiscriminant': 'factored-compensated',
        'tubeFacing': 'scalar-discriminant',
        'maxSteps': settings['steps'], 'supersampling': settings['supersample'],
        'resampling': 'Lanczos', 'stillWidth': settings['still_width'],
        'stillHeight': settings['still_height'], 'stillMaxSteps': settings['still_steps'],
        'sourceHashes': scene['sourceHashes'],
        'encoding': {'mp4': {'encoder': 'libx264', 'passes': 2, 'preset': 'veryslow',
                                  'pixelFormat': 'yuv420p', 'references': 4,
                                  'landscapeLevel': '4.2', 'portraitLevel': '3.2', 'endpointSeconds': 1.5,
                                  'endpointBitrateFactor': 2.5, 'maxrateFactor': 2},
                     'webm': {'encoder': 'libaom-av1', 'passes': 2, 'cpuUsed': 2,
                              'firstPassCpuUsed': 6, 'pixelFormat': 'yuv420p10le',
                              'rowMt': 1, 'tiles': '2x1', 'lagInFrames': 35},
                     'landscapeBitrate': 4_000_000, 'portraitBitrate': 1_500_000,
                     'keyframeInterval': round(8*scene['fps']),
                     'ffmpegVersion': subprocess.check_output(
                         [ffmpeg, '-version'], text=True).splitlines()[0]},
        'stations': [{'index': i, 'image': f'station-{i}.webp',
                      'portraitImage': f'station-{i}-portrait.webp', 'phase': frame['phase']}
                     for i, frame in enumerate(scene['stations'])],
        'transitions': [],
        'rewind': {'from': 3, 'to': 0,
                   'kind': scene.get('rewindKind', 'reverse-route'),
                   'speed': 1 if scene.get('rewindKind') == 'closing-loop' else 3,
                   'timelineDuration': (len(scene['rewind'])-1)/scene['fps'],
                   'videoDuration': len(scene['rewind'])/scene['fps'],
                   'frameCount': len(scene['rewind']),
                   'mp4': 'rewind.mp4', 'webm': 'rewind.webm',
                   'portrait': {'mp4': 'rewind-portrait.mp4', 'webm': 'rewind-portrait.webm'}},
    }
    for leg in range(len(scene['legs'])):
        entry = {'from': leg, 'to': leg + 1,
                 'timelineDuration': (len(scene['legs'][leg])-1)/scene['fps'],
                 'videoDuration': len(scene['legs'][leg])/scene['fps'],
                 'frameCount': len(scene['legs'][leg])}
        for direction in ['forward', 'reverse']:
            entry[direction] = {codec: f'transition-{leg}-{direction}.{codec}'
                                for codec in ['mp4', 'webm']}
            entry[direction]['portrait'] = {
                codec: f'transition-{leg}-{direction}-portrait.{codec}'
                for codec in ['mp4', 'webm']}
        manifest['transitions'].append(entry)
    manifest['files'] = {
        path.name: {'bytes': path.stat().st_size,
                    'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
        for path in sorted(output.iterdir()) if path.suffix in ['.webp', '.mp4', '.webm']
        and not path.name.startswith('.')}
    temporary = output / '.manifest.partial.json'
    temporary.write_text(json.dumps(manifest, indent=2) + '\n')
    temporary.replace(output / 'manifest.json')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--width', type=int, default=1920)
    parser.add_argument('--height', type=int, default=960)
    parser.add_argument('--still-width', type=int, default=3840)
    parser.add_argument('--still-height', type=int, default=1920)
    parser.add_argument('--supersample', type=float, default=1.5)
    parser.add_argument('--steps', type=int, default=160)
    parser.add_argument('--still-steps', type=int, default=160)
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--skip-encode', action='store_true')
    parser.add_argument('--encode-only', action='store_true')
    parser.add_argument('--ffmpeg', default=os.environ.get('FFMPEG_BINARY', 'ffmpeg'))
    parser.add_argument('--threads', type=int, default=2)
    parser.add_argument('--encode-jobs', type=int, default=1,
                        help='Concurrent encoders; use 2 only with sufficient RAM after rendering.')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    scene = json.loads((args.work / 'scene.json').read_text())
    started = time.perf_counter()
    def progress(stage, **values):
        record = dict(stage=stage, elapsedSeconds=round(time.perf_counter()-started, 2),
                      updatedUnix=time.time(), pid=os.getpid(), **values)
        path=args.work / 'progress.json'
        temporary=path.with_suffix('.partial.json')
        temporary.write_text(json.dumps(record, indent=2)+'\n')
        temporary.replace(path)
    if any(v <= 0 or v % 2 for v in [args.width, args.height, args.still_width, args.still_height]):
        parser.error('Image dimensions must be positive even integers.')
    if args.supersample < 1 or args.threads < 1 or args.encode_jobs < 1 or args.steps < 1 or args.still_steps < 1:
        parser.error('Supersampling, threads and traversal limits must be at least 1.')
    if args.width * args.still_height != args.height * args.still_width:
        parser.error('Stills and videos must use the same aspect ratio.')
    if args.width < portrait_width(args.height):
        parser.error('Master image must be at least as wide as the portrait crop.')
    if args.encode_only and (args.force or args.skip_encode):
        parser.error('--encode-only cannot be combined with --force or --skip-encode.')
    keys = ['width', 'height', 'still_width', 'still_height', 'supersample', 'steps', 'still_steps']
    settings = {key: getattr(args, key) for key in keys}
    settings['sceneSha256'] = hashlib.sha256((args.work / 'scene.json').read_bytes()).hexdigest()
    settings_path = args.work / 'render-settings.json'
    if settings_path.exists() and not args.force and json.loads(settings_path.read_text()) != settings:
        parser.error('Cached render settings differ; choose a new work directory or use --force.')
    if not settings_path.exists() and not args.force and any((args.work / 'frames').glob('leg-*/*.png')):
        parser.error('Cached frames have no provenance record; choose a new work directory or use --force.')
    if args.encode_only and not settings_path.exists():
        parser.error('--encode-only requires the provenance record from a completed render.')
    if args.force:
        # Invalidate the entire old generation first, so interruption cannot mix scenes.
        for path in (args.work / 'frames').glob('*/*.png'):
            path.unlink()
    settings_path.write_text(json.dumps(settings, indent=2) + '\n')
    if not args.encode_only:
        spec = importlib.util.spec_from_file_location(
            'prerender_egl', Path(__file__).with_name('prerender-egl.py'))
        egl = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(egl)
        def render_image(renderer, frame, size):
            image = Image.frombytes('RGBA', (renderer.width, renderer.height), renderer.render(frame))
            image = image.transpose(Image.Transpose.FLIP_TOP_BOTTOM).convert('RGB')
            return image.resize(size, Image.Resampling.LANCZOS) if image.size != size else image
        # Poster cache belongs to this work generation, not an arbitrary output directory.
        poster_provenance = args.work / 'poster-settings.json'
        poster_names = [f'station-{i}{suffix}.webp' for i in range(len(scene['stations']))
                        for suffix in ['', '-portrait']]
        record = {}
        if not args.force and poster_provenance.exists():
            try:
                record = json.loads(poster_provenance.read_text())
            except json.JSONDecodeError:
                pass  # Incomplete provenance never authorizes reuse of existing images.
        reuse_posters = (not args.force and record.get('settings') == settings
                         and all((args.output / name).is_file()
                                 and hashlib.sha256((args.output / name).read_bytes()).hexdigest()
                                 == record.get('files', {}).get(name) for name in poster_names))
        if not reuse_posters:
            poster_provenance.unlink(missing_ok=True)
            still = egl.Renderer(scene, round(args.still_width * args.supersample),
                                 round(args.still_height * args.supersample), args.still_steps)
            for i, frame in enumerate(scene['stations']):
                image = render_image(still, frame, (args.still_width, args.still_height))
                save_image(image, args.output / f'station-{i}.webp')
                save_image(crop_portrait(image), args.output / f'station-{i}-portrait.webp')
                print(f'Still {i} complete', flush=True)
                progress('posters', completed=i+1, total=len(scene['stations']))
            still.close()
            record = {'settings': settings, 'files': {
                name: hashlib.sha256((args.output / name).read_bytes()).hexdigest()
                for name in poster_names}}
            poster_provenance.write_text(json.dumps(record, indent=2) + '\n')
        renderer = egl.Renderer(scene, round(args.width * args.supersample),
                                round(args.height * args.supersample), args.steps)
    for leg, frames in enumerate(scene['legs']):
        directory = args.work / 'frames' / f'leg-{leg}'
        directory.mkdir(parents=True, exist_ok=True)
        if not args.encode_only:
            for i, frame in enumerate(frames):
                path = directory / f'{i:04d}.png'
                if not path.exists():
                    save_image(render_image(renderer, frame, (args.width, args.height)), path)
                if i % 20 == 0 or i == len(frames) - 1:
                    print(f'Leg {leg}: {i+1}/{len(frames)}, elapsed {time.perf_counter()-started:.0f}s', flush=True)
                    progress('render', leg=leg, completed=i+1, total=len(frames))
        if not args.skip_encode:
            progress('encode', leg=leg)
            encode_leg(args.work, args.output, scene, leg, ffmpeg=args.ffmpeg,
                       threads=args.threads, width=args.width, height=args.height, jobs=args.encode_jobs)
    if not args.encode_only and scene.get('rewindKind') == 'closing-loop':
        directory = args.work / 'frames' / 'rewind'
        directory.mkdir(parents=True, exist_ok=True)
        for i, frame in enumerate(scene['rewind']):
            path = directory / f'{i:04d}.png'
            if not path.exists():
                save_image(render_image(renderer, frame, (args.width, args.height)), path)
            if i % 20 == 0 or i == len(scene['rewind']) - 1:
                print(f'Closing loop: {i+1}/{len(scene["rewind"])}, elapsed {time.perf_counter()-started:.0f}s', flush=True)
                progress('render', leg='rewind', completed=i+1, total=len(scene['rewind']))
    if not args.encode_only:
        renderer.close()
    if not args.skip_encode:
        progress('encode', leg='rewind')
        encode_rewind(args.work, args.output, scene, ffmpeg=args.ffmpeg,
                      threads=args.threads, width=args.width, height=args.height, jobs=args.encode_jobs)
        write_manifest(args.work, args.output, scene, settings, args.ffmpeg)
    progress('rendered' if args.skip_encode else 'complete')
    print(f'Complete: {time.perf_counter()-started:.0f}s', flush=True)


if __name__ == '__main__':
    main()
