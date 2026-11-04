import ctypes,json,sys
from ctypes import wintypes
u=ctypes.WinDLL('user32');u.SetProcessDpiAwarenessContext.argtypes=[ctypes.c_void_p];u.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
u.WindowFromPoint.argtypes=[wintypes.POINT];u.WindowFromPoint.restype=wintypes.HWND
u.GetAncestor.argtypes=[wintypes.HWND,wintypes.UINT];u.GetAncestor.restype=wintypes.HWND
h=u.WindowFromPoint(wintypes.POINT(int(sys.argv[1]),int(sys.argv[2])));root=u.GetAncestor(h,2)
def info(handle):
 text=ctypes.create_unicode_buffer(256);cls=ctypes.create_unicode_buffer(256);rect=wintypes.RECT();u.GetWindowTextW(wintypes.HWND(handle),text,256);u.GetClassNameW(wintypes.HWND(handle),cls,256);u.GetWindowRect(wintypes.HWND(handle),ctypes.byref(rect))
 return dict(title=text.value,cls=cls.value,rect=[rect.left,rect.top,rect.right,rect.bottom],visible=bool(u.IsWindowVisible(wintypes.HWND(handle))),enabled=bool(u.IsWindowEnabled(wintypes.HWND(handle))),exstyle=u.GetWindowLongW(wintypes.HWND(handle),-20))
g=ctypes.WinDLL('gdi32');u.GetDC.restype=wintypes.HDC;g.GetPixel.argtypes=[wintypes.HDC,ctypes.c_int,ctypes.c_int];g.GetPixel.restype=wintypes.DWORD;u.ReleaseDC.argtypes=[wintypes.HWND,wintypes.HDC]
dc=u.GetDC(None)
try:pixel=g.GetPixel(dc,int(sys.argv[1]),int(sys.argv[2]))
finally:u.ReleaseDC(None,dc)
print(json.dumps(dict(pixel=pixel,hit=str(h or 0),root=str(root or 0),actual=info(root),expected=info(int(sys.argv[3])) if len(sys.argv)>3 else None)))
