"""
Study Agent 托盘启动器
双击图标打开应用，右键菜单可打开/退出
"""
import sys
import os
import time
import threading
import subprocess
import webbrowser

import pystray
from PIL import Image, ImageDraw

# ── 路径 ─────────────────────────────────────────────────────

ROOT    = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(ROOT, "backend")
FRONTEND = os.path.join(ROOT, "frontend")
APP_URL  = "http://localhost:5173"

# ── 图标（用 Pillow 绘制，无需图片文件）────────────────────

def make_icon() -> Image.Image:
    size = 64
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # 圆形背景
    draw.ellipse([2, 2, size-2, size-2], fill=(139, 90, 60))
    # 星形（三角近似）
    cx, cy = size // 2, size // 2
    star_pts = []
    import math
    for i in range(5):
        angle_out = math.radians(i * 72 - 90)
        angle_in  = math.radians(i * 72 - 90 + 36)
        star_pts += [
            (cx + 20 * math.cos(angle_out), cy + 20 * math.sin(angle_out)),
            (cx + 9  * math.cos(angle_in),  cy + 9  * math.sin(angle_in)),
        ]
    draw.polygon(star_pts, fill=(255, 220, 120))
    return img

# ── 进程管理 ─────────────────────────────────────────────────

_procs: list[subprocess.Popen] = []

def start_backend() -> subprocess.Popen:
    return subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app", "--port", "8000"],
        cwd=BACKEND,
        creationflags=subprocess.CREATE_NO_WINDOW,  # Windows：不弹黑窗口
    )

def start_frontend() -> subprocess.Popen:
    npm = "npm.cmd" if sys.platform == "win32" else "npm"
    return subprocess.Popen(
        [npm, "run", "dev"],
        cwd=FRONTEND,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )

def wait_and_open(seconds: int = 3) -> None:
    """等后端/前端就绪后打开浏览器。"""
    time.sleep(seconds)
    webbrowser.open(APP_URL)

def launch_all() -> None:
    _procs.append(start_backend())
    _procs.append(start_frontend())
    t = threading.Thread(target=wait_and_open, daemon=True)
    t.start()

def stop_all() -> None:
    for p in _procs:
        try:
            p.terminate()
        except Exception:
            pass

# ── 托盘菜单动作 ─────────────────────────────────────────────

def on_open(icon, item):
    webbrowser.open(APP_URL)

def on_quit(icon, item):
    stop_all()
    icon.stop()

# ── 主入口 ───────────────────────────────────────────────────

def main() -> None:
    launch_all()

    icon = pystray.Icon(
        name="study_agent",
        icon=make_icon(),
        title="Study Agent",
        menu=pystray.Menu(
            pystray.MenuItem("打开", on_open, default=True),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("退出", on_quit),
        ),
    )
    icon.run()

if __name__ == "__main__":
    main()
