"""Native surfaceless EGL/OpenGL renderer for the site's analytic shader.

Uses Python standard-library ctypes and system Mesa; no browser is involved.
Float64 scenes use desktop OpenGL 4.5 double uniforms and uniform buffers.
Float32 scenes use GLES3. Camera matrices arrive in the same column-major order as WebGL uniforms.
An optional uniform buffer replaces texture fetches of the same float32 data;
all ray, intersection and shading expressions remain unchanged.
"""
import ctypes as C, ctypes.util, os, re
os.environ.setdefault('EGL_PLATFORM','surfaceless')
os.environ.setdefault('LIBGL_ALWAYS_SOFTWARE','1')
E=C.CDLL(ctypes.util.find_library('EGL'))
GLES=C.CDLL(ctypes.util.find_library('GLESv2'))
GL=C.CDLL(ctypes.util.find_library('GL'))
def function(lib,name,result,args):
 f=getattr(lib,name);f.restype=result;f.argtypes=args;return f
I=C.c_int;U=C.c_uint;F=C.c_float;D=C.c_double;B=C.c_ubyte;P=C.c_void_p
for name,result,args in [
 ('eglGetDisplay',P,[P]),('eglInitialize',U,[P,C.POINTER(I),C.POINTER(I)]),
 ('eglBindAPI',U,[U]),('eglChooseConfig',U,[P,C.POINTER(I),C.POINTER(P),I,C.POINTER(I)]),
 ('eglCreatePbufferSurface',P,[P,P,C.POINTER(I)]),('eglCreateContext',P,[P,P,P,C.POINTER(I)]),
 ('eglMakeCurrent',U,[P,P,P,P]),('eglDestroyContext',U,[P,P]),
 ('eglDestroySurface',U,[P,P]),('eglTerminate',U,[P]),('eglGetError',U,[])]:function(E,name,result,args)
for name,result,args in [
 ('glGenVertexArrays',None,[I,C.POINTER(U)]),('glBindVertexArray',None,[U]),
 ('glGetUniformBlockIndex',U,[U,C.c_char_p]),('glUniformBlockBinding',None,[U,U,U]),
 ('glGenBuffers',None,[I,C.POINTER(U)]),('glBindBuffer',None,[U,U]),('glBufferData',None,[U,C.c_ssize_t,P,U]),('glBindBufferBase',None,[U,U,U]),
 ('glGetString',C.c_char_p,[U]),('glGetError',U,[]),('glCreateShader',U,[U]),
 ('glShaderSource',None,[U,I,C.POINTER(C.c_char_p),C.POINTER(I)]),('glCompileShader',None,[U]),
 ('glGetShaderiv',None,[U,U,C.POINTER(I)]),('glGetShaderInfoLog',None,[U,I,C.POINTER(I),C.c_char_p]),
 ('glCreateProgram',U,[]),('glAttachShader',None,[U,U]),('glLinkProgram',None,[U]),
 ('glGetProgramiv',None,[U,U,C.POINTER(I)]),('glGetProgramInfoLog',None,[U,I,C.POINTER(I),C.c_char_p]),
 ('glUseProgram',None,[U]),('glGenTextures',None,[I,C.POINTER(U)]),('glBindTexture',None,[U,U]),
 ('glTexImage2D',None,[U,I,I,I,I,I,U,U,P]),('glTexParameteri',None,[U,U,I]),
 ('glGetUniformLocation',I,[U,C.c_char_p]),('glUniform1i',None,[I,I]),('glUniform1f',None,[I,F]),
 ('glUniform2f',None,[I,F,F]),('glUniformMatrix4fv',None,[I,I,B,C.POINTER(F)]),
 ('glViewport',None,[I,I,I,I]),('glDrawArrays',None,[U,I,I]),('glFinish',None,[]),
 ('glReadPixels',None,[I,I,I,I,U,U,P]),('glPixelStorei',None,[U,I]),
 ('glGenFramebuffers',None,[I,C.POINTER(U)]),('glBindFramebuffer',None,[U,U]),
 ('glFramebufferTexture2D',None,[U,U,U,U,I]),('glCheckFramebufferStatus',U,[U])]:
 for backend in [GL,GLES]:function(backend,name,result,args)
for name,result,args in [('glUniform1d',None,[I,D]),('glUniform2d',None,[I,D,D]),('glUniformMatrix4dv',None,[I,I,B,C.POINTER(D)])]:function(GL,name,result,args)
class Renderer:
 def __init__(self,scene,width,height,steps=112,uniform_buffer=True):
  self.width,self.height=width,height
  self.double_precision=scene.get('precision')=='float64'
  G=GL if self.double_precision else GLES;self.gl=G
  if self.double_precision and not uniform_buffer:raise ValueError('Double geometry requires a uniform buffer')
  self.display=E.eglGetDisplay(None);major=I();minor=I()
  if not E.eglInitialize(self.display,C.byref(major),C.byref(minor)):raise RuntimeError(hex(E.eglGetError()))
  if not E.eglBindAPI(0x30A2 if self.double_precision else 0x30A0):raise RuntimeError(hex(E.eglGetError()))
  attrs=(I*15)(0x3033,1,0x3040,8 if self.double_precision else 0x40,0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3038,0,0)
  cfg=P();num=I()
  if not E.eglChooseConfig(self.display,attrs,C.byref(cfg),1,C.byref(num)) or not num.value:raise RuntimeError('No suitable EGL config')
  self.surface=E.eglCreatePbufferSurface(self.display,cfg,(I*5)(0x3057,width,0x3056,height,0x3038))
  context_attrs=(I*7)(0x3098,4,0x30FB,5,0x30FD,1,0x3038) if self.double_precision else (I*3)(0x3098,3,0x3038)
  self.context=E.eglCreateContext(self.display,cfg,None,context_attrs)
  if not E.eglMakeCurrent(self.display,self.surface,self.surface,self.context):raise RuntimeError(hex(E.eglGetError()))
  print('GL',G.glGetString(0x1F02).decode(),G.glGetString(0x1F01).decode(),flush=True)
  def shader(kind,source):
   s=G.glCreateShader(kind);src=C.c_char_p(source.encode());G.glShaderSource(s,1,C.byref(src),None);G.glCompileShader(s)
   good=I();G.glGetShaderiv(s,0x8B81,C.byref(good))
   if not good.value:
    log=C.create_string_buffer(65536);G.glGetShaderInfoLog(s,len(log),None,log);raise RuntimeError(log.value.decode())
   return s
  vertex='#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0.,1.);}'
  if self.double_precision:vertex=vertex.replace('#version 300 es','#version 450 core')
  fragment=scene['fragment']
  if uniform_buffer and not self.double_precision:
   # Same float32 values and indexing, avoiding texture machinery in software GL.
   fragment=re.sub(r'uniform (?:highp )?sampler2D manifold;',f'layout(std140) uniform ManifoldData {{ vec4 sceneData[{len(scene["texels"])//4}]; }};',fragment)
   fragment=re.sub(r'texelFetch\(manifold,ivec2\(slot,cell\*(\d+)\+index\),0\)',lambda m:f'sceneData[(cell*{m[1]}+index)*{scene["width"]}+slot]',fragment)
  self.program=G.glCreateProgram();G.glAttachShader(self.program,shader(0x8B31,vertex));G.glAttachShader(self.program,shader(0x8B30,fragment));G.glLinkProgram(self.program)
  good=I();G.glGetProgramiv(self.program,0x8B82,C.byref(good))
  if not good.value:
   log=C.create_string_buffer(65536);G.glGetProgramInfoLog(self.program,len(log),None,log);raise RuntimeError(log.value.decode())
  G.glUseProgram(self.program)
  vao=U();G.glGenVertexArrays(1,C.byref(vao));G.glBindVertexArray(vao)
  scalar=D if self.double_precision else F
  data=(scalar*len(scene['texels']))(*scene['texels'])
  if uniform_buffer:
   buffer=U();G.glGenBuffers(1,C.byref(buffer));G.glBindBuffer(0x8A11,buffer);G.glBufferData(0x8A11,C.sizeof(data),data,0x88E4);G.glBindBufferBase(0x8A11,0,buffer);G.glUniformBlockBinding(self.program,G.glGetUniformBlockIndex(self.program,b'ManifoldData'),0)
  else:
   tex=U();G.glGenTextures(1,C.byref(tex));G.glBindTexture(0x0DE1,tex)
   G.glTexImage2D(0x0DE1,0,0x8814,scene['width'],scene['height'],0,0x1908,0x1406,data)
   for parameter,value in [(0x2801,0x2600),(0x2800,0x2600),(0x2802,0x812F),(0x2803,0x812F)]:G.glTexParameteri(0x0DE1,parameter,value)
  self.uniform=lambda name:G.glGetUniformLocation(self.program,name.encode())
  G.glUniform1i(self.uniform('manifold'),0);G.glUniform1i(self.uniform('maxSteps'),steps)
  if self.double_precision:
   G.glUniform1d(self.uniform('beamRadiusSquared'),__import__('math').sinh(.025)**2)
   G.glUniform2d(self.uniform('resolution'),width,height)
  else:
   G.glUniform1f(self.uniform('beamRadius'),.025);G.glUniform2f(self.uniform('resolution'),width,height)
  G.glViewport(0,0,width,height)
  self.pixels=(B*(width*height*4))()
  err=G.glGetError()
  if err:raise RuntimeError(hex(err))
 def render(self,frame):
  G=self.gl
  if not E.eglMakeCurrent(self.display,self.surface,self.surface,self.context):raise RuntimeError(hex(E.eglGetError()))
  if self.double_precision:G.glUniformMatrix4dv(self.uniform('camera'),1,False,(D*16)(*frame['camera']))
  else:G.glUniformMatrix4fv(self.uniform('camera'),1,False,(F*16)(*frame['camera']))
  G.glUniform1i(self.uniform('cameraCell'),frame['cell'])
  G.glDrawArrays(0x0004,0,3);G.glReadPixels(0,0,self.width,self.height,0x1908,0x1401,self.pixels)
  err=G.glGetError()
  if err:raise RuntimeError(hex(err))
  return bytes(self.pixels)

 def close(self):
  """Release framebuffer/context before another large render or encoding."""
  if self.context:
   E.eglMakeCurrent(self.display,None,None,None)
   E.eglDestroyContext(self.display,self.context)
   E.eglDestroySurface(self.display,self.surface)
   E.eglTerminate(self.display)
   self.context=None
   self.surface=None
   self.pixels=None
