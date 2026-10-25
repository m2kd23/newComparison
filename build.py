"""src/ui.html 에 core.js, hwpx.js 를 넣어 단일 HTML(신구조문대비표_생성기.html)을 만든다."""
from pathlib import Path

root = Path(__file__).parent
ui = (root / 'src/ui.html').read_text(encoding='utf-8')
core = (root / 'src/core.js').read_text(encoding='utf-8')
hwpx = (root / 'src/hwpx.js').read_text(encoding='utf-8')
assert '</script' not in core + hwpx
out = ui.replace('/*__CORE__*/', core).replace('/*__HWPX__*/', hwpx)
(root / '신구조문대비표_생성기.html').write_text(out, encoding='utf-8')
print('built 신구조문대비표_생성기.html')
