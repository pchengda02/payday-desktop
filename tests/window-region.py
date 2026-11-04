import ctypes,json,sys
from ctypes import wintypes
user32=ctypes.WinDLL('user32');gdi32=ctypes.WinDLL('gdi32')
user32.SetProcessDpiAwarenessContext.argtypes=[ctypes.c_void_p]
user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
gdi32.CreateRectRgn.restype=wintypes.HANDLE
gdi32.GetRgnBox.argtypes=[wintypes.HANDLE,ctypes.POINTER(wintypes.RECT)]
gdi32.DeleteObject.argtypes=[wintypes.HANDLE]
user32.GetWindowRgn.argtypes=[wintypes.HWND,wintypes.HANDLE]
region=gdi32.CreateRectRgn(0,0,0,0);rect=wintypes.RECT()
try:
 kind=user32.GetWindowRgn(wintypes.HWND(int(sys.argv[1])),region);gdi32.GetRgnBox(region,ctypes.byref(rect))
 print(json.dumps(dict(kind=kind,left=rect.left,top=rect.top,width=rect.right-rect.left,height=rect.bottom-rect.top)))
finally:gdi32.DeleteObject(region)
