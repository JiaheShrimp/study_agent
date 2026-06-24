"""
Study Agent 托盘启动器
双击图标打开应用，右键菜单可打开/退出
"""
import sys
import os
import time
import math
import json
import threading
import subprocess
import webbrowser
from datetime import datetime

import pystray
from PIL import Image, ImageDraw

# ── 路径 ─────────────────────────────────────────────────────

ROOT     = os.path.dirname(os.path.abspath(__file__))
BACKEND  = os.path.join(ROOT, "backend")
FRONTEND = os.path.join(ROOT, "frontend")
APP_URL  = "http://localhost:5173"
CONFIG_FILE = os.path.join(ROOT, "backend", "data", "config.json")

# ── 图标 ─────────────────────────────────────────────────────

def make_icon() -> Image.Image:
    size = 64
    img  = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([2, 2, size - 2, size - 2], fill=(139, 90, 60))
    cx, cy = size // 2, size // 2
    pts = []
    for i in range(5):
        a_out = math.radians(i * 72 - 90)
        a_in  = math.radians(i * 72 - 90 + 36)
        pts += [
            (cx + 20 * math.cos(a_out), cy + 20 * math.sin(a_out)),
            (cx + 9  * math.cos(a_in),  cy + 9  * math.sin(a_in)),
        ]
    draw.polygon(pts, fill=(255, 220, 120))
    return img

# ── 进程管理 ─────────────────────────────────────────────────

_procs: list[subprocess.Popen] = []

LOG_DIR = os.path.join(ROOT, "logs")
os.makedirs(LOG_DIR, exist_ok=True)

def _logfile(name: str):
    return open(os.path.join(LOG_DIR, name), "a", encoding="utf-8")

def start_backend() -> subprocess.Popen:
    # --reload：改后端代码自动重启，不用退出托盘再起。
    # reloader 会拉起 worker 子进程；退出时靠 stop_all() 的端口清理兜底回收。
    return subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app", "--port", "8000", "--reload"],
        cwd=BACKEND,
        creationflags=subprocess.CREATE_NO_WINDOW,
        stdout=_logfile("backend.log"),
        stderr=_logfile("backend.log"),
    )

def start_frontend() -> subprocess.Popen:
    npm = "npm.cmd" if sys.platform == "win32" else "npm"
    return subprocess.Popen(
        [npm, "run", "dev"],
        cwd=FRONTEND,
        creationflags=subprocess.CREATE_NO_WINDOW,
        stdout=_logfile("frontend.log"),
        stderr=_logfile("frontend.log"),
    )

def _wait_url(url: str, timeout: int = 30) -> bool:
    """轮询 url 直到返回响应或超时。用于等待前/后端真正就绪。"""
    import urllib.request
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=2)
            return True
        except Exception:
            time.sleep(0.5)
    return False

def wait_and_open() -> None:
    # 等后端就绪
    _wait_url("http://localhost:8000/api/bonus/today", timeout=30)
    # 等前端 Vite 真正能响应（含首次依赖预构建），避免在预构建未完成时打开导致整页 reload
    _wait_url(APP_URL, timeout=60)
    # 预构建完成后再多给一拍，确保 optimizeDeps 写盘完毕，浏览器首次加载即拿到优化后的依赖
    time.sleep(1.5)
    webbrowser.open(APP_URL)

def _kill_port(port: int) -> None:
    """结束占用指定端口的进程（Windows netstat）"""
    try:
        out = subprocess.check_output(
            f'netstat -ano | findstr :{port}',
            shell=True, text=True, stderr=subprocess.DEVNULL
        )
        for line in out.splitlines():
            parts = line.split()
            if len(parts) >= 5 and f':{port}' in parts[1] and parts[3] == 'LISTENING':
                pid = int(parts[4])
                subprocess.call(f'taskkill /F /PID {pid}', shell=True,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass

def launch_all() -> None:
    _kill_port(8000)
    _kill_port(5173)
    time.sleep(0.5)
    _procs.append(start_backend())
    _procs.append(start_frontend())
    threading.Thread(target=wait_and_open, daemon=True).start()

def stop_all() -> None:
    for p in _procs:
        try:
            p.terminate()
        except Exception:
            pass
    # --reload 会留下 worker 子进程占端口；清掉它，避免下次启动端口被占
    _kill_port(8000)
    _kill_port(5173)

# ── 通知 ─────────────────────────────────────────────────────

def send_notification() -> None:
    try:
        from winotify import Notification, audio
        toast = Notification(
            app_id="Study Agent",
            title="该记录今天的赢了 🎉",
            msg="打开应用，把今天的进步记下来吧！",
            duration="short",
            launch=APP_URL,
        )
        toast.set_audio(audio.Default, loop=False)
        toast.show()
    except Exception:
        pass

def _load_reminder_config() -> tuple[bool, list[str]]:
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            return cfg.get("reminder_enabled", False), cfg.get("reminder_times", ["21:00"])
    except Exception:
        pass
    return False, ["21:00"]

def reminder_loop() -> None:
    """每分钟检查一次是否到了提醒时间，避免同一分钟重复通知。"""
    notified_today: set[str] = set()

    while True:
        now  = datetime.now()
        today = now.strftime("%Y-%m-%d")
        hm    = now.strftime("%H:%M")

        # 跨天清空记录
        if not any(k.startswith(today) for k in notified_today):
            notified_today.clear()

        enabled, times = _load_reminder_config()
        key = f"{today}_{hm}"

        if enabled and hm in times and key not in notified_today:
            notified_today.add(key)
            send_notification()

        time.sleep(30)  # 每 30 秒检查，确保不漏掉整点

# ── 托盘菜单 ─────────────────────────────────────────────────

def on_open(icon, item):
    webbrowser.open(APP_URL)

def on_quit(icon, item):
    stop_all()
    icon.stop()

# ── 主入口 ───────────────────────────────────────────────────

def main() -> None:
    launch_all()
    threading.Thread(target=reminder_loop, daemon=True).start()

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
