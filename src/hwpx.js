/* ===== 한글(HWPX) 파일 생성 ===== */
var SGHwpx = (function () {
  'use strict';

  var NS = 'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"';
  var XMLDECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>';

  function x(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  }

  /* ---------- 문서 모델 ----------
     doc = { title, font, size, header:[l,r], rows:[{top,bottom,cells:[[para],[para]]}] }
     para = { indent:0.., align:'L'|'C', runs:[{t, color:'#RRGGBB'|null, u:bool, b:bool}] } */

  // 글자 모양을 필요할 때마다 등록
  function CharTable(font, size) {
    this.list = []; this.map = {}; this.size = size;
  }
  CharTable.prototype.id = function (st) {
    var key = [st.color || '#000000', st.u ? 1 : 0, st.b ? 1 : 0, st.h || this.size].join('|');
    if (this.map[key] === undefined) { this.map[key] = this.list.length; this.list.push({ color: st.color || '#000000', u: !!st.u, b: !!st.b, h: st.h || this.size }); }
    return this.map[key];
  };

  function charPrXML(id, c) {
    var h = Math.round(c.h * 100);
    return '<hh:charPr id="' + id + '" height="' + h + '" textColor="' + c.color + '" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2">' +
      '<hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>' +
      '<hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>' +
      '<hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>' +
      '<hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>' +
      '<hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>' +
      (c.b ? '<hh:bold/>' : '') +
      '<hh:underline type="' + (c.u ? 'BOTTOM' : 'NONE') + '" shape="SOLID" color="' + (c.u ? c.color : '#000000') + '"/>' +
      '<hh:strikeout shape="NONE" color="#000000"/><hh:outline type="NONE"/>' +
      '<hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/></hh:charPr>';
  }

  function borderXML(id, l, r, t, b, fill, bw) {
    function side(tag, on, w) { return '<hh:' + tag + ' type="' + (on ? 'SOLID' : 'NONE') + '" width="' + (w || '0.12 mm') + '" color="#000000"/>'; }
    return '<hh:borderFill id="' + id + '" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">' +
      '<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>' +
      side('leftBorder', l) + side('rightBorder', r) + side('topBorder', t) + side('bottomBorder', b, bw) +
      '<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>' +
      '<hc:fillBrush><hc:winBrush faceColor="' + (fill || 'none') + '" hatchColor="#000000" alpha="0"/></hc:fillBrush></hh:borderFill>';
  }
  // 테두리 번호: 1·2 없음, 3+ (위·아래 조합) 표 셀, 7 제목행
  var BF = { none: 1, nonePara: 2, both: 3, top: 4, mid: 5, bottom: 6, head: 7 };
  function bfFor(top, bottom) { return top && bottom ? BF.both : top ? BF.top : bottom ? BF.bottom : BF.mid; }

  // 문단 모양: 0 양쪽, 1 가운데, 2~9 들여쓰기 단계
  var INDENT_STEP = 1000; // 10pt
  function paraPrXML(id, align, left, prev, line) {
    function m(div) {
      return '<hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="' + Math.round(left / div) + '" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/>' +
        '<hc:prev value="' + Math.round(prev / div) + '" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin>' +
        '<hh:lineSpacing type="PERCENT" value="' + line + '" unit="HWPUNIT"/>';
    }
    return '<hh:paraPr id="' + id + '" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="0" suppressLineNumbers="0" checked="0" textDir="AUTO">' +
      '<hh:align horizontal="' + align + '" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/>' +
      '<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>' +
      '<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>' +
      '<hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">' + m(2) + '</hp:case><hp:default>' + m(1) + '</hp:default></hp:switch>' +
      '<hh:border borderFillIDRef="2" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/></hh:paraPr>';
  }
  var PP_JUSTIFY = 0, PP_CENTER = 1, PP_INDENT0 = 2, MAX_INDENT = 7;

  function headerXML(font, chars) {
    var langs = ['HANGUL', 'LATIN', 'HANJA', 'JAPANESE', 'OTHER', 'SYMBOL', 'USER'];
    var fonts = langs.map(function (lg) {
      return '<hh:fontface lang="' + lg + '" fontCnt="1"><hh:font id="0" face="' + x(font) + '" type="TTF" isEmbedded="0">' +
        '<hh:typeInfo familyType="FCAT_GOTHIC" weight="6" proportion="0" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/></hh:font></hh:fontface>';
    }).join('');
    var borders = [
      borderXML(1, 0, 0, 0, 0), borderXML(2, 0, 0, 0, 0),
      borderXML(3, 1, 1, 1, 1), borderXML(4, 1, 1, 1, 0), borderXML(5, 1, 1, 0, 0), borderXML(6, 1, 1, 0, 1),
      borderXML(7, 1, 1, 1, 1, '#D9D9D9', '0.4 mm')
    ];
    var paras = [paraPrXML(0, 'JUSTIFY', 0, 0, 160), paraPrXML(1, 'CENTER', 0, 0, 160)];
    for (var i = 0; i <= MAX_INDENT; i++) paras.push(paraPrXML(PP_INDENT0 + i, 'JUSTIFY', i * INDENT_STEP, 0, 160));
    var numbering = '<hh:numberings itemCnt="1"><hh:numbering id="1" start="0">' +
      [['1', 'DIGIT', '^1.'], ['2', 'HANGUL_SYLLABLE', '^2.'], ['3', 'DIGIT', '^3)'], ['4', 'HANGUL_SYLLABLE', '^4)'], ['5', 'DIGIT', '(^5)'], ['6', 'HANGUL_SYLLABLE', '(^6)'], ['7', 'DIGIT', '^7']].map(function (n) {
        return '<hh:paraHead start="1" level="' + n[0] + '" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="' + n[1] + '" charPrIDRef="4294967295" checkable="0">' + x(n[2]) + '</hh:paraHead>';
      }).join('') + '</hh:numbering></hh:numberings>';

    return XMLDECL + '<hh:head ' + NS + ' version="1.5" secCnt="1">' +
      '<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/><hh:refList>' +
      '<hh:fontfaces itemCnt="7">' + fonts + '</hh:fontfaces>' +
      '<hh:borderFills itemCnt="' + borders.length + '">' + borders.join('') + '</hh:borderFills>' +
      '<hh:charProperties itemCnt="' + chars.list.length + '">' + chars.list.map(function (c, k) { return charPrXML(k, c); }).join('') + '</hh:charProperties>' +
      '<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>' +
      numbering +
      '<hh:paraProperties itemCnt="' + paras.length + '">' + paras.join('') + '</hh:paraProperties>' +
      '<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles>' +
      '</hh:refList><hh:compatibleDocument targetProgram="HWP201X"><hh:layoutCompatibility/></hh:compatibleDocument>' +
      '<hh:docOption><hh:linkinfo path="" pageInherit="1" footnoteInherit="0"/></hh:docOption><hh:trackchageConfig flags="56"/></hh:head>';
  }

  // A4 세로, 좌우 15mm
  var PAGE_W = 59528, PAGE_H = 84188, MARGIN_LR = 4252, TEXT_W = PAGE_W - MARGIN_LR * 2;
  var SECPR = '<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">' +
    '<hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>' +
    '<hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>' +
    '<hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>' +
    '<hp:pagePr landscape="WIDELY" width="' + PAGE_W + '" height="' + PAGE_H + '" gutterType="LEFT_ONLY"><hp:margin header="2835" footer="2835" gutter="0" left="' + MARGIN_LR + '" right="' + MARGIN_LR + '" top="5669" bottom="4252"/></hp:pagePr>' +
    '<hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr>' +
    '<hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr>' +
    ['BOTH', 'EVEN', 'ODD'].map(function (t) { return '<hp:pageBorderFill type="' + t + '" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill>'; }).join('') +
    '</hp:secPr>';

  function pXML(para, chars, defaultCp) {
    var pp = para.align === 'C' ? PP_CENTER : PP_INDENT0 + Math.max(0, Math.min(MAX_INDENT, para.indent || 0));
    var runs = para.runs.filter(function (r) { return r.t !== ''; });
    var body = runs.length ? runs.map(function (r) {
      return '<hp:run charPrIDRef="' + chars.id(r) + '"><hp:t>' + x(r.t) + '</hp:t></hp:run>';
    }).join('') : '<hp:run charPrIDRef="' + defaultCp + '"><hp:t/></hp:run>';
    return '<hp:p id="0" paraPrIDRef="' + pp + '" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">' + body + '</hp:p>';
  }

  function cellXML(paras, chars, col, row, w, bf, isHead, defaultCp) {
    if (!paras.length) paras = [{ indent: 0, runs: [] }];
    return '<hp:tc name="" header="' + (isHead ? 1 : 0) + '" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="' + bf + '">' +
      '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="' + (isHead ? 'CENTER' : 'TOP') + '" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">' +
      paras.map(function (p) { return pXML(p, chars, defaultCp); }).join('') +
      '</hp:subList><hp:cellAddr colAddr="' + col + '" rowAddr="' + row + '"/><hp:cellSpan colSpan="1" rowSpan="1"/>' +
      '<hp:cellSz width="' + w + '" height="1000"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>';
  }

  function sectionXML(doc, chars) {
    var cp0 = chars.id({});
    var cpTitle = chars.id({ b: true, h: doc.size + 6 });
    var cpHead = chars.id({ b: true, h: doc.size + 1 });
    var colW = Math.floor(TEXT_W / 2);
    var rows = [];
    rows.push('<hp:tr>' + doc.header.map(function (t, c) {
      return cellXML([{ align: 'C', runs: [{ t: t, b: true, h: doc.size + 1 }] }], chars, c, 0, colW, BF.head, true, cpHead);
    }).join('') + '</hp:tr>');
    doc.rows.forEach(function (r, i) {
      var bf = bfFor(r.top, r.bottom);
      rows.push('<hp:tr>' + r.cells.map(function (paras, c) { return cellXML(paras, chars, c, i + 1, colW, bf, false, cp0); }).join('') + '</hp:tr>');
    });
    var tblId = 1000000000 + Math.floor(Math.random() * 900000000);
    var tbl = '<hp:tbl id="' + tblId + '" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="' + rows.length + '" colCnt="2" cellSpacing="0" borderFillIDRef="' + BF.both + '" noAdjust="0">' +
      '<hp:sz width="' + (colW * 2) + '" widthRelTo="ABSOLUTE" height="' + (rows.length * 1000) + '" heightRelTo="ABSOLUTE" protect="0"/>' +
      '<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>' +
      '<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>' +
      rows.join('') + '</hp:tbl>';

    var out = XMLDECL + '<hs:sec ' + NS + '>';
    out += '<hp:p id="0" paraPrIDRef="' + PP_JUSTIFY + '" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="' + cp0 + '">' + SECPR +
      '<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl></hp:run>' +
      (doc.title ? '' : '<hp:run charPrIDRef="' + cp0 + '"><hp:t/></hp:run>') + '</hp:p>';
    if (doc.title) {
      out += '<hp:p id="0" paraPrIDRef="' + PP_CENTER + '" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="' + cpTitle + '"><hp:t>' + x(doc.title) + '</hp:t></hp:run></hp:p>';
      out += '<hp:p id="0" paraPrIDRef="' + PP_JUSTIFY + '" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="' + cp0 + '"><hp:t/></hp:run></hp:p>';
    }
    out += '<hp:p id="0" paraPrIDRef="' + PP_JUSTIFY + '" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="' + cp0 + '">' + tbl + '<hp:t/></hp:run></hp:p>';
    out += '</hs:sec>';
    return out;
  }

  function contentHpf(title) {
    var now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    return XMLDECL + '<opf:package ' + NS + ' version="" unique-identifier="" id=""><opf:metadata><opf:title>' + x(title || '') + '</opf:title><opf:language>ko</opf:language>' +
      '<opf:meta name="creator" content="text">신구조문대비표 생성기</opf:meta><opf:meta name="subject" content="text">신구조문대비표</opf:meta>' +
      '<opf:meta name="CreatedDate" content="text">' + now + '</opf:meta><opf:meta name="ModifiedDate" content="text">' + now + '</opf:meta></opf:metadata>' +
      '<opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>' +
      '<opf:item id="settings" href="settings.xml" media-type="application/xml"/></opf:manifest>' +
      '<opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>';
  }

  var VERSION = XMLDECL + '<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="1" buildNumber="0" os="1" xmlVersion="1.5" application="Hancom Office Hangul" appVersion="12, 0, 0, 0 WIN32LEWindows_10"/>';
  var CONTAINER = XMLDECL + '<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/><ocf:rootfile full-path="Preview/PrvText.txt" media-type="text/plain"/></ocf:rootfiles></ocf:container>';
  var MANIFEST = XMLDECL + '<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>';
  var SETTINGS = XMLDECL + '<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"><ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>';

  /* ---------- ZIP (무압축) ---------- */
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    return new Uint8Array(Buffer.from(s, 'utf8'));
  }
  function zip(files) {
    var parts = [], central = [], offset = 0;
    function u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
    function u32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }
    var DOS_TIME = 0, DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
    files.forEach(function (f) {
      var name = utf8(f.name), data = typeof f.data === 'string' ? utf8(f.data) : f.data, crc = crc32(data);
      var common = [].concat(u16(20), u16(0), u16(0), u16(DOS_TIME), u16(DOS_DATE), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      var local = new Uint8Array([0x50, 0x4b, 0x03, 0x04].concat(common));
      parts.push(local, name, data);
      central.push(new Uint8Array([0x50, 0x4b, 0x01, 0x02].concat(u16(20), common, u16(0), u16(0), u16(0), u32(0), u32(offset))), name);
      offset += local.length + name.length + data.length;
    });
    var cdSize = central.reduce(function (s, a) { return s + a.length; }, 0);
    var end = new Uint8Array([0x50, 0x4b, 0x05, 0x06].concat(u16(0), u16(0), u16(files.length), u16(files.length), u32(cdSize), u32(offset), u16(0)));
    var all = parts.concat(central, [end]), total = all.reduce(function (s, a) { return s + a.length; }, 0);
    var out = new Uint8Array(total), p = 0;
    all.forEach(function (a) { out.set(a, p); p += a.length; });
    return out;
  }

  function build(doc) {
    var chars = new CharTable(doc.font, doc.size);
    chars.id({}); // 0번 = 기본 글자
    var section = sectionXML(doc, chars);
    var header = headerXML(doc.font, chars);
    var prv = [doc.title || ''].concat(doc.rows.slice(0, 30).map(function (r) {
      return r.cells.map(function (ps) { return ps.map(function (p) { return p.runs.map(function (q) { return q.t; }).join(''); }).join(' '); }).join(' | ');
    })).join('\r\n').slice(0, 1000);
    return zip([
      { name: 'mimetype', data: 'application/hwp+zip' },
      { name: 'version.xml', data: VERSION },
      { name: 'Contents/header.xml', data: header },
      { name: 'Contents/section0.xml', data: section },
      { name: 'Preview/PrvText.txt', data: prv },
      { name: 'settings.xml', data: SETTINGS },
      { name: 'META-INF/container.xml', data: CONTAINER },
      { name: 'META-INF/manifest.xml', data: MANIFEST },
      { name: 'Contents/content.hpf', data: contentHpf(doc.title) }
    ]);
  }

  return { build: build };
})();
if (typeof module !== 'undefined') module.exports = SGHwpx;
