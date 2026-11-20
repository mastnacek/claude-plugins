"""Prototyp robota kolegy: 18 x 22 pixelů (půlbloky), plátno 22 sloupců (vpravo efekty).
Spuštění: python preview.py   (Ctrl+C konec)
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

ROBOT_W = 18  # šířka robota v pixelech
W = 22        # plátno: robot + 4 sloupce vpravo na efekty

# Hlava s dvěma dalekohledovými očima; {L},{R} = 5 pixelů vnitřku oka.
HEAD = [
    "........KK........",
    ".......KAAK.......",
    "........KK........",
    "........aa........",
    "..KKKKKKaaKKKKKK..",
    ".Kss" + "h" * 11 + "mdK",
    ".KKKKKKKhhKKKKKKK.",
    ".K{L0}KhhK{R0}K.",
    ".K{L1}KmmK{R1}K.",
    ".K{L2}KddK{R2}K.",
    ".KKKKKKKKKKKKKKKK.",
]
BODY = [
    ".......KddK.......",
    "....KKKKKKKKKK....",
    ".KK.KOObbbbbBK.KK.",
    "KhhKKbKXXXXKBKKhhK",
    "KmmKKbKxxxxKBKKmmK",
    ".KK.KbKxXxXKBK.KK.",
    "....KbbbbbbbBK....",
    "....KBBBBBBBBK....",
    "..KKKKKKKKKKKKKK..",
    ".KtTtTtTtTtTtTtTK.",
    "..KKKKKKKKKKKKKK..",
]
H_HEAD = len(HEAD)


def eye(c, look):
    """5 pixelů vnitřku oka (sklo + 3 duhovka + sklo) ve 3 řádcích podle směru pohledu."""
    core = {"mid": [f"o{c}{c}{c}o", f"o{c}p{c}o", f"o{c}{c}{c}o"],
            "left": [f"{c}{c}{c}oo", f"{c}p{c}oo", f"{c}{c}{c}oo"],
            "right": [f"oo{c}{c}{c}", f"oo{c}p{c}", f"oo{c}{c}{c}"],
            "up": [f"o{c}p{c}o", f"o{c}{c}{c}o", "ooooo"],
            "shut": ["ooooo", "KKKKK", "ooooo"]}[look]
    if look != "shut":
        core[0] = "w" + core[0][1:]
    return core


def put(row, col, s):
    """Vloží řetězec do řádku plátna od sloupce col ('.' = průhledné, nepřepisuje)."""
    r = list(row)
    for i, ch in enumerate(s):
        if ch != "." and 0 <= col + i < W:
            r[col + i] = ch
    return "".join(r)


def compose(color="c", look="mid", antenna="A", bubble=None, lines=False, red=False, zzz=0):
    L, R = eye(color, look), eye(color, look)
    head = []
    for row in HEAD:
        for i in range(3):
            row = row.replace("{L%d}" % i, L[i]).replace("{R%d}" % i, R[i])
        head.append(row.replace("A", antenna))
    g = head + list(BODY)
    for r in g:
        assert len(r) == ROBOT_W, (len(r), r)
    g = [r.ljust(W, ".") for r in g]
    if red:
        g[1] = g[1].replace(antenna * 2, "RR")
        b = H_HEAD
        g[b + 3] = g[b + 3].replace("hh", "RR")
        g[1] = put(g[1], 19, "KRK")
        g[2] = put(g[2], 19, "KRK")
        g[4] = put(g[4], 20, "R")
    if bubble:
        for i in range(3):
            g[i] = put(g[i], 13, bubble[i])
    if lines:
        for i, w_ in ((H_HEAD + 2, "llll"), (H_HEAD + 4, "lll."), (H_HEAD + 6, "llll")):
            g[i] = put(g[i], 18, w_)
    if zzz:
        z = ["......qq", ".....q..", "....qq..", "qq......"][:zzz]
        for i, s in enumerate(z):
            g[i] = put(g[i], 13, s)
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
    rows = list(grid) + (["." * W] if len(grid) % 2 else [])
    out = ["\x1b[H"]
    for y in range(0, len(rows), 2):
        out.append(" " + "".join(cell(a, b) for a, b in zip(rows[y], rows[y + 1])) + "\x1b[K\n")
    out.append(f" \x1b[2m{label}\x1b[0m\x1b[K\x1b[J")
    sys.stdout.write("".join(out)); sys.stdout.flush()


if __name__ == "__main__":
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
