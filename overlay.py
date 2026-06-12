"""
像素风任务进度悬浮窗
通过 WebSocket 订阅 ws://localhost:8000/ws/progress/overlay 接收进度数据
窗口置顶、可拖拽、像素感 Canvas 渲染
"""
import tkinter as tk
import threading
import json
import sys
import time
import math

# ── WebSocket 依赖（标准库 websockets 或 websocket-client）────────
try:
    import websocket  # websocket-client
    USE_WS_CLIENT = True
except ImportError:
    USE_WS_CLIENT = False

# ── 配色（像素风暖色调）─────────────────────────────────────────
BG        = "#1a1a2e"   # 深蓝背景
BG2       = "#16213e"   # 稍浅面板
ACCENT    = "#e94560"   # 红色强调
GREEN     = "#0f9b58"   # 进度绿
AMBER     = "#f5a623"   # 警告橙
TEXT      = "#eaeaea"   # 主文字
MUTED     = "#888899"   # 次要文字
TRACK_BG  = "#0d0d1a"   # 跑道背景
GROUND    = "#2a2a4a"   # 地面色
PIXEL     = 3           # 像素格大小（放大倍率）

# ── 像素 sprite 定义（8×8，行优先，1=前景，0=透明）──────────────
RUNNER_SPRITE = [
    "00011000",
    "00011000",
    "00111100",
    "01011010",
    "00111100",
    "00110000",
    "01001000",
    "10000100",
]

MONSTER_SPRITE = [
    "01100110",
    "11111111",
    "10111101",
    "11111111",
    "01111110",
    "00100100",
    "01000010",
    "10000001",
]

FLAG_SPRITE = [
    "01111100",
    "01100000",
    "01111100",
    "01000000",
    "01000000",
    "01000000",
    "01000000",
    "01000000",
]


def draw_sprite(canvas: tk.Canvas, sprite: list[str], x: int, y: int, color: str, pixel: int = PIXEL):
    """在 canvas 上绘制像素 sprite"""
    for row_i, row in enumerate(sprite):
        for col_i, bit in enumerate(row):
            if bit == "1":
                px = x + col_i * pixel
                py = y + row_i * pixel
                canvas.create_rectangle(px, py, px + pixel, py + pixel, fill=color, outline="")


# ── 悬浮窗主类 ───────────────────────────────────────────────────
class OverlayWindow:
    W = 320
    H = 140

    def __init__(self):
        self.root = tk.Tk()
        self.root.overrideredirect(True)       # 无标题栏
        self.root.attributes("-topmost", True) # 始终置顶
        self.root.attributes("-alpha", 0.93)   # 轻微透明
        self.root.configure(bg=BG)

        # 初始位置：右下角
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        x = sw - self.W - 24
        y = sh - self.H - 60
        self.root.geometry(f"{self.W}x{self.H}+{x}+{y}")

        self._build_ui()
        self._bind_drag()

        # 状态
        self.runner_pct  = 5.0
        self.monster_pct = 0.0
        self.rest_pct    = 100.0
        self.worked_secs = 0
        self.total_secs  = 1800
        self.paused      = False
        self.task_name   = "任务进行中"
        self.ended       = False
        self._anim_frame = 0

        # 动画循环
        self._animate()

        # WS 线程
        self._ws_thread = threading.Thread(target=self._ws_loop, daemon=True)
        self._ws_thread.start()

    # ── UI 构建 ──────────────────────────────────────────────────
    def _build_ui(self):
        # 顶部标题栏（可拖拽区域）
        self.title_bar = tk.Frame(self.root, bg=BG2, height=24)
        self.title_bar.pack(fill="x")
        self.title_bar.pack_propagate(False)

        self.lbl_title = tk.Label(
            self.title_bar, text="⚔ 任务进行中", bg=BG2, fg=TEXT,
            font=("Courier New", 9, "bold"), anchor="w", padx=8
        )
        self.lbl_title.pack(side="left", fill="y")

        # 关闭按钮
        btn_close = tk.Label(
            self.title_bar, text="✕", bg=BG2, fg=MUTED,
            font=("Courier New", 9), padx=8, cursor="hand2"
        )
        btn_close.pack(side="right", fill="y")
        btn_close.bind("<Button-1>", lambda e: self.root.destroy())

        # 时间 + 百分比
        info_frame = tk.Frame(self.root, bg=BG, pady=4)
        info_frame.pack(fill="x", padx=10)

        self.lbl_time = tk.Label(
            info_frame, text="00:00", bg=BG, fg=ACCENT,
            font=("Courier New", 20, "bold")
        )
        self.lbl_time.pack(side="left")

        self.lbl_pct = tk.Label(
            info_frame, text="0%", bg=BG, fg=MUTED,
            font=("Courier New", 10)
        )
        self.lbl_pct.pack(side="right")

        self.lbl_status = tk.Label(
            info_frame, text="冲刺中", bg=BG, fg=GREEN,
            font=("Courier New", 8)
        )
        self.lbl_status.pack(side="right", padx=6)

        # 像素跑道 canvas
        self.canvas = tk.Canvas(
            self.root, width=self.W - 20, height=44,
            bg=TRACK_BG, highlightthickness=1, highlightbackground=GROUND
        )
        self.canvas.pack(padx=10)

        # 休息预算条
        rest_frame = tk.Frame(self.root, bg=BG, pady=4)
        rest_frame.pack(fill="x", padx=10)

        tk.Label(rest_frame, text="休息", bg=BG, fg=MUTED,
                 font=("Courier New", 7)).pack(side="left")

        self.rest_bar_bg = tk.Frame(rest_frame, bg=GROUND, height=6)
        self.rest_bar_bg.pack(side="left", fill="x", expand=True, padx=(4, 4))

        self.rest_bar = tk.Frame(self.rest_bar_bg, bg=GREEN, height=6)
        self.rest_bar.place(relx=0, rely=0, relwidth=1.0, relheight=1.0)

        self.lbl_rest = tk.Label(rest_frame, text="100%", bg=BG, fg=MUTED,
                                  font=("Courier New", 7))
        self.lbl_rest.pack(side="right")

    def _bind_drag(self):
        """标题栏拖拽移动窗口"""
        self._drag_x = 0
        self._drag_y = 0

        def start(e):
            self._drag_x = e.x_root - self.root.winfo_x()
            self._drag_y = e.y_root - self.root.winfo_y()

        def drag(e):
            self.root.geometry(f"+{e.x_root - self._drag_x}+{e.y_root - self._drag_y}")

        self.title_bar.bind("<ButtonPress-1>", start)
        self.title_bar.bind("<B1-Motion>", drag)
        self.lbl_title.bind("<ButtonPress-1>", start)
        self.lbl_title.bind("<B1-Motion>", drag)

    # ── 动画循环 ─────────────────────────────────────────────────
    def _animate(self):
        if not self.ended:
            self._anim_frame += 1
            self._redraw()
        self.root.after(100, self._animate)  # 10fps 刷新

    def _redraw(self):
        c = self.canvas
        c.delete("all")

        W = self.W - 20
        H = 44

        # 地面
        c.create_rectangle(0, H - 8, W, H, fill=GROUND, outline="")
        # 像素地面砖块
        for bx in range(0, W, 12):
            c.create_rectangle(bx, H - 8, bx + 11, H - 1, fill="#1e1e3a", outline=GROUND)

        # 终点旗
        flag_x = W - 20
        draw_sprite(c, FLAG_SPRITE, flag_x, H - 8 - 8 * PIXEL, AMBER)

        # 进度轨道（可选：画虚线轨迹）
        for dx in range(4, W - 20, 18):
            c.create_rectangle(dx, H - 10, dx + 8, H - 9, fill=GROUND, outline="")

        # 怪兽位置
        monster_x = int((self.monster_pct / 100) * (W - 40)) + 2
        monster_color = ACCENT if (self.runner_pct - self.monster_pct) < 20 else "#cc4488"
        draw_sprite(c, MONSTER_SPRITE, monster_x, H - 8 - 8 * PIXEL, monster_color)

        # 小人位置（跑步动画：奇偶帧偏移）
        runner_x = int((min(self.runner_pct, 96) / 100) * (W - 40)) + 2
        runner_y_offset = 0
        if not self.paused:
            runner_y_offset = 1 if (self._anim_frame % 4) < 2 else -1
        runner_color = TEXT
        draw_sprite(c, RUNNER_SPRITE, runner_x, H - 8 - 8 * PIXEL + runner_y_offset, runner_color)

        # 更新标签
        remaining = max(0, self.total_secs - self.worked_secs)
        m = int(remaining // 60)
        s = int(remaining % 60)
        self.lbl_time.config(text=f"{m:02d}:{s:02d}")

        pct = min(100, int(self.worked_secs / max(self.total_secs, 1) * 100))
        self.lbl_pct.config(text=f"{pct}%")

        if self.paused:
            self.lbl_status.config(text="⚠ 暂停", fg=ACCENT)
        else:
            self.lbl_status.config(text="▶ 冲刺", fg=GREEN)

        # 标题截断
        name = self.task_name if len(self.task_name) <= 14 else self.task_name[:13] + "…"
        self.lbl_title.config(text=f"⚔ {name}")

        # 休息预算条颜色
        rest = self.rest_pct / 100
        if self.rest_pct > 50:
            bar_color = GREEN
        elif self.rest_pct > 25:
            bar_color = AMBER
        else:
            bar_color = ACCENT
        self.rest_bar.config(bg=bar_color)
        self.rest_bar.place(relwidth=rest)
        self.lbl_rest.config(text=f"{int(self.rest_pct)}%")

    # ── WebSocket 接收 ───────────────────────────────────────────
    def _ws_loop(self):
        url = "ws://localhost:8000/ws/progress/overlay"
        retry = 0
        while not self.ended:
            try:
                if USE_WS_CLIENT:
                    self._ws_client_connect(url)
                else:
                    self._ws_stdlib_connect(url)
                retry = 0
            except Exception:
                retry += 1
                time.sleep(min(retry * 0.5, 3))

    def _ws_client_connect(self, url: str):
        def on_message(ws, message):
            self._handle_message(message)

        def on_error(ws, error):
            pass

        def on_close(ws, *a):
            pass

        ws = websocket.WebSocketApp(url, on_message=on_message,
                                    on_error=on_error, on_close=on_close)
        ws.run_forever()

    def _ws_stdlib_connect(self, url: str):
        """使用标准库 http.client 做 WebSocket 握手（简化实现）"""
        import socket, base64, hashlib, struct

        host = "localhost"
        port = 8000
        path = "/ws/progress/overlay"

        key = base64.b64encode(b"studyagentoverlay1==").decode()
        handshake = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n\r\n"
        )

        sock = socket.create_connection((host, port), timeout=5)
        sock.sendall(handshake.encode())

        # 读取响应头
        resp = b""
        while b"\r\n\r\n" not in resp:
            resp += sock.recv(1024)

        # 读取 WebSocket 帧
        while not self.ended:
            header = self._recv_exact(sock, 2)
            if not header:
                break
            b0, b1 = header[0], header[1]
            masked = (b1 & 0x80) != 0
            length = b1 & 0x7f
            if length == 126:
                length = struct.unpack(">H", self._recv_exact(sock, 2))[0]
            elif length == 127:
                length = struct.unpack(">Q", self._recv_exact(sock, 8))[0]
            if masked:
                mask = self._recv_exact(sock, 4)
            data = self._recv_exact(sock, length)
            if masked:
                data = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
            opcode = b0 & 0x0f
            if opcode == 8:   # close
                break
            if opcode == 1:   # text
                self._handle_message(data.decode("utf-8", errors="replace"))

        sock.close()

    def _recv_exact(self, sock, n: int) -> bytes:
        buf = b""
        while len(buf) < n:
            chunk = sock.recv(n - len(buf))
            if not chunk:
                return buf
            buf += chunk
        return buf

    def _handle_message(self, msg: str):
        try:
            data = json.loads(msg)
        except Exception:
            return

        if data.get("type") == "end":
            self.ended = True
            self.root.after(0, self.root.destroy)
            return

        self.runner_pct  = data.get("runner_pct", self.runner_pct)
        self.monster_pct = data.get("monster_pct", self.monster_pct)
        self.rest_pct    = data.get("rest_pct", self.rest_pct)
        self.worked_secs = data.get("worked_secs", self.worked_secs)
        self.total_secs  = data.get("total_secs", self.total_secs)
        self.paused      = data.get("paused", self.paused)
        self.task_name   = data.get("task_name", self.task_name)

    def run(self):
        self.root.mainloop()


# ── 入口 ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    win = OverlayWindow()
    win.run()
