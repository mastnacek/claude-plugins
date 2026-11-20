"""Jemnější prototyp robota kolegy: 28 x 22 pixelů (půlbloky), obrys, stíny, odlesky.
Spuštění: python preview2.py   (Ctrl+C konec)
"""
import os, sys, time

P = {
    "K": (22, 24, 30),     # obrys
    "h": (150, 162, 180),  # plech světlý
    "m": (118, 130, 148),  # plech střední
    "d": (84, 94, 110),    # plech stín
    "s": (205, 214, 226),  # odlesk plechu
    "o": (232, 240, 248),  # sklo
    "c": (120, 200, 255),  # duhovka modrá
    "g": (110, 230, 140),  # duhovka zelená (čte)
    "y": (255, 214, 70),   # duhovka žlutá (přemýšlí)
    "R": (245, 70, 70),    # červená
    "p": (16, 18, 24),     # zornice
    "w": (255, 255, 255),  # odlesk skla
    "A": (255, 210, 60),   # světlo antény
    "a": (190, 196, 206),  # anténa
    "b": (226, 146, 44),   # tělo oranžové
    "B": (178, 106, 26),   # tělo stín
    "O": (250, 186, 96),   # tělo odlesk
    "x": (90, 170, 255),   # displej
    "X": (40, 90, 160),    # displej tmavý
    "t": (52, 56, 64),     # pás
    "T": (86, 92, 104),    # článek pásu
    "q": (240, 244, 255),  # bublina / Zzz
    "l": (110, 190, 255),  # řádky textu
}

# Hlava s dvěma dalekohledovými očima; {L},{R} = 3x3 vnitřek oka.
HEAD = [
    ".............KK.............",
    "............KAAK............",
    ".............KK.............",
    ".............aa.............",
    "....KKKKKKKKKaaKKKKKKKKKK...",
    "...KsshhhhhhhhhhhhhhhhhmdK..",
    "..KKKKKKKhhhhhhhhhKKKKKKKK..",
    ".KoooooooKhhhhhhhKoooooooKK.",
    ".Ko{L0}oKmmmmmmmKo{R0}oKdK.",
    ".Ko{L1}oKmmmmmmmKo{R1}oKdK.",
    ".Ko{L2}oKdddddddKo{R2}oKdK.",
    "..KKKKKKKKKKKKKKKKKKKKKKKK..",
]
BODY = [
    "...........KddK.............",
    "..KK....KKKKKKKKKKKK....KK..",
    ".KhhK..KOObbbbbbbbbBK..KhhK.",
    ".KmmKKKKObKXXXXXXKbBKKKKmmK.",
    "..KmmmmKbbKxxxxxxKbBKmmmmK..",
    "....KKKKbbKXxXxXxKbBKKKK....",
    ".......KbbbbbbbbbbbBK.......",
    ".......KBBBBBBBBBBBBK.......",
    "...KKKKKKKKKKKKKKKKKKKKK....",
    "..KtTtTtTtTtTtTtTtTtTtTK....",
]

def eye(c, look):
    # 5 sloupců vnitřku oka (o + 3 duhovka + o) podle směru pohledu
    core = {"mid": [f"o{c}{c}{c}o".replace(c + c + c, c + "p" + c), f"o{c}p{c}o", f"o{c}{c}{c}o"],
            "left": [f"{c}{c}{c}oo", f"{c}p{c}oo", f"{c}{c}{c}oo"],
            "right": [f"oo{c}{c}{c}", f"oo{c}p{c}", f"oo{c}{c}{c}"],
            "up": [f"o{c}p{c}o", f"o{c}{c}{c}o", "ooooo"],
            "shut": ["ooooo", "KKKKK", "ooooo"]}[look]
    core[0] = "w" + core[0][1:] if look != "shut" else core[0]
    return core

def compose(color="c", look="mid", antenna="A", bubble=None, lines=False, red=False, zzz=0):
    L, R = eye(color, look), eye(color, look)
    head = []
    for row in HEAD:
        for i in range(3):
            row = row.replace("{L%d}" % i, L[i]).replace("{R%d}" % i, R[i])
        head.append(row.replace("A", antenna).ljust(28, ".")[:28])
    body = [r.ljust(28, ".")[:28] for r in BODY]
    g = head + body
    if red:
        g[1] = g[1].replace("AA", "RR").replace(antenna * 2, "RR")
        g = [r if i not in (16, 17) else r.replace("hh", "RR") for i, r in enumerate(g)]
        g[2] = g[2][:22] + "KRK..."
        g[3] = g[3][:22] + "KRK..."
        g[5] = g[5][:22] + ".R...."
    if bubble:
        g[0] = g[0][:20] + bubble[0]
        g[1] = g[1][:20] + bubble[1]
        g[2] = g[2][:20] + bubble[2]
    if lines:
        for i, w in ((14, "lllll"), (16, "llll."), (18, "lllll")):
            g[i] = g[i][:23] + w
    if zzz:
        z = ["......qq", ".....q..", "....qq..", "qq......"][:zzz]
        for i, s in enumerate(z):
            g[i] = g[i][:20] + s
    return g

FRAMES = {
    "čeká": [compose(), compose(), compose(), compose(look="shut")],
    "událost": [compose(look="left", antenna="A"), compose(look="right", antenna="a")],
    "čte": [compose("g", "left", lines=True), compose("g", "mid", lines=True), compose("g", "right", lines=True)],
    "přemýšlí": [compose("y", "up", bubble=["..KqqK..", ".KqqqqK.", "..KqqK.."]),
                 compose("y", "up", bubble=["..KqqK..", ".Kq..qK.", "..KqqK.."])],
    "blokace": [compose("c", "mid", red=True), compose("c", "mid", antenna="a")],
    "spí": [compose(look="shut", antenna="a", zzz=2), compose(look="shut", antenna="a", zzz=4)],
}

def cell(top, bot):
    t, b = P.get(top), P.get(bot)
    if t and b:
        return f"\x1b[38;2;{t[0]};{t[1]};{t[2]}m\x1b[48;2;{b[0]};{b[1]};{b[2]}m▀\x1b[0m"
    if t:
        return f"\x1b[38;2;{t[0]};{t[1]};{t[2]}m▀\x1b[0m"
    if b:
        return f"\x1b[38;2;{b[0]};{b[1]};{b[2]}m▄\x1b[0m"
    return " "

def draw(grid, label):
    rows = list(grid) + (["." * 28] if len(grid) % 2 else [])
    out = ["\x1b[H"]
    last = len(rows) - 2
    for y in range(0, len(rows), 2):
        tail = f" \x1b[2m{label}\x1b[0m" if y == last else ""
        out.append(" " + "".join(cell(a, b) for a, b in zip(rows[y], rows[y + 1])) + tail + "\x1b[K" + ("" if y == last else "\n"))
    out.append("\x1b[J")
    sys.stdout.write("".join(out)); sys.stdout.flush()

os.system("")
sys.stdout.write("\x1b[2J\x1b[?25l")
try:
    while True:
        for state, frames in FRAMES.items():
            for _ in range(3):
                for f in frames:
                    draw(f, state)
                    time.sleep(0.4)
except KeyboardInterrupt:
    sys.stdout.write("\x1b[?25h\n")
