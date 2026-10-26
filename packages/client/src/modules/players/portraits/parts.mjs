// Original TOUCHLINE artwork. Every part uses the same 256 × 256 portrait rig.
export const PORTRAIT_VERSION = 'touchline-ink-1';
export const INK = '#18232a';
export const SKINS = [
  { name: '浅桃', skin: '#f1c29b', shade: '#cb8c70', light: '#ffdcba', blush: '#db927c' },
  { name: '暖杏', skin: '#dca47a', shade: '#ae7358', light: '#f3c294', blush: '#c57f68' },
  { name: '蜜棕', skin: '#ba8058', shade: '#8f563d', light: '#d49e73', blush: '#ac6854' },
  { name: '深棕', skin: '#83583f', shade: '#5f3c30', light: '#a57553', blush: '#925c4e' },
  { name: '深褐', skin: '#604438', shade: '#402f2a', light: '#805b44', blush: '#734a40' },
  { name: '玫桃', skin: '#e5ad96', shade: '#b77d6c', light: '#f5cbb0', blush: '#d28b82' },
  { name: '橄榄', skin: '#c19b69', shade: '#96704f', light: '#ddba87', blush: '#b48369' },
  { name: '浅金', skin: '#e7cba0', shade: '#b99a77', light: '#f5e0b9', blush: '#cda38a' },
];
export const HAIR_COLORS = [
  { name: '墨黑', hair: '#282b2b', hairLight: '#4b5050' },
  { name: '深栗', hair: '#50392e', hairLight: '#795741' },
  { name: '红棕', hair: '#8b4630', hairLight: '#b96742' },
  { name: '麦金', hair: '#b99648', hairLight: '#dec073' },
  { name: '灰棕', hair: '#766858', hairLight: '#a0957d' },
  { name: '银灰', hair: '#9aabac', hairLight: '#cfdbd4' },
  { name: '乌褐', hair: '#362c2c', hairLight: '#5a4442' },
  { name: '铜橘', hair: '#a5532d', hairLight: '#d98442' },
];
export const KITS = [
  { name: '临场绿', kit: '#326d64', trim: '#eee0bb', kitShade: '#214d4b' },
  { name: '酒红', kit: '#813e43', trim: '#edcf9e', kitShade: '#5b3038' },
  { name: '客场米白', kit: '#ddd5b9', trim: '#426a66', kitShade: '#afa78f' },
  { name: '门将金', kit: '#d5a440', trim: '#294f54', kitShade: '#a27832' },
  { name: '海军蓝', kit: '#384f66', trim: '#c6d6c5', kitShade: '#263a50' },
];
export const BACKGROUNDS = ['#d7dfd6', '#e4d2aa', '#c7d7d9', '#d9c7b9', '#c7cec0', '#d0ccd9'];

// Tokens are filled from the fixed palettes, never from player-supplied strings.
export const HEADS = [
  {
    id: 'long',
    name: '长面条',
    face: 'M76 82Q76 43 125 45Q179 42 181 85L174 164Q168 203 133 210Q93 208 85 171Z',
    shade: 'M167 84L178 86L172 165Q165 201 133 208L122 204Q151 192 157 162Z',
    detail: 'M99 180Q98 190 107 196M150 190L144 198',
  },
  {
    id: 'square',
    name: '方下巴',
    face: 'M73 82Q75 46 126 46Q176 45 183 82L184 169Q181 197 161 202L103 204Q80 200 77 177Z',
    shade: 'M165 81L181 84L181 172Q178 195 158 199L106 201L100 191L155 190Q167 187 168 162Z',
    detail: 'M93 176L98 188M162 177L157 189',
  },
  {
    id: 'wide',
    name: '宽颊',
    face: 'M74 78Q81 45 129 47Q174 45 183 79L193 138Q192 182 169 197Q151 210 127 207Q87 209 72 178Q62 159 66 132Z',
    shade: 'M175 87L184 95L191 139Q189 182 166 195Q149 205 127 204L115 198Q163 199 174 160Z',
    detail: 'M82 164L89 174M167 166L160 180',
  },
  {
    id: 'pear',
    name: '梨形脸',
    face: 'M81 84Q79 46 125 46Q172 43 176 81L176 126Q193 155 186 178Q177 208 132 211Q83 211 72 185Q65 167 77 133Z',
    shade:
      'M161 82L174 84L173 126Q192 157 184 179Q172 207 131 208L119 201Q161 201 169 179Q176 158 162 134Z',
    detail: 'M88 183Q92 192 105 195M158 192L167 184',
  },
  {
    id: 'taper',
    name: '尖下巴',
    face: 'M72 84Q76 44 126 45Q180 42 183 83L178 150Q173 174 153 195L132 211L106 198Q82 179 79 155Z',
    shade: 'M164 82L181 85L176 150Q170 175 151 193L132 208L124 200Q151 181 158 152Z',
    detail: 'M94 173L104 184M149 184L144 193',
  },
  {
    id: 'round',
    name: '圆墩墩',
    face: 'M72 92Q71 46 124 45Q181 42 185 88L189 143Q190 185 163 201Q132 220 101 202Q72 189 68 151Z',
    shade: 'M166 85L183 89L187 145Q189 183 160 199Q130 215 103 200L105 194Q153 205 168 167Z',
    detail: 'M85 170Q88 179 99 183M164 172L158 184',
  },
];
export const HAIRS = [
  {
    id: 'quiff',
    name: '冲天乱翘',
    back: '',
    front:
      'M75 113L64 82L73 69L65 55L88 58L87 37L107 47L124 23L132 39L158 26L155 44Q185 40 187 61L196 72L180 113L171 85Q153 90 150 63Q124 93 88 88L84 115Z',
    shine: 'M84 69Q118 75 145 43M151 54Q169 49 177 63',
  },
  {
    id: 'crop',
    name: '毛刺短寸',
    back: '',
    front:
      'M73 113L68 78L74 63L70 53L84 56L91 43L106 48L117 37L129 44L145 36L151 45L167 44L174 55L184 59L187 83L178 113L169 89L162 78L150 83L137 75L123 80L109 73L94 83L85 83L82 111Z',
    shine: 'M85 64L103 59M113 57L132 54M143 57L162 59',
  },
  {
    id: 'sidepart',
    name: '油头偏分',
    back: '',
    front:
      'M75 115L69 84Q61 53 90 44Q116 23 153 40Q188 43 186 81L179 117L169 95L166 65Q139 92 89 84L82 113Z',
    shine: 'M82 70Q117 71 151 47M87 59Q119 58 137 45M163 52Q176 61 173 78',
    line: 'M155 47L163 67',
  },
  {
    id: 'mop',
    name: '蓬松乱发',
    back: 'M78 96Q59 122 65 156L79 150L83 174L94 160L164 165L175 178L179 155L191 161Q198 134 179 96Z',
    front:
      'M70 112L58 97L68 83L58 70L77 65L74 47L95 49L105 31L120 44L139 28L149 45L174 40L177 56L193 60L189 77L199 92L181 118L169 91L159 102L149 73L128 91L120 71L99 96L92 79L82 117Z',
    shine: 'M81 69L100 61L96 79M121 56L135 46M155 56L170 67',
  },
  {
    id: 'curls',
    name: '卷毛团',
    back: '',
    front:
      'M73 117Q59 110 64 98Q54 86 66 77Q55 64 70 58Q67 43 84 44Q88 27 102 36Q113 21 127 32Q144 21 154 35Q172 27 177 43Q195 44 188 61Q201 73 188 83Q197 96 184 104L180 117L168 93Q157 99 151 85Q140 98 128 85Q116 98 105 85Q91 98 86 88L82 117Z',
    shine:
      'M78 68Q73 57 85 56M104 55Q100 44 112 44M133 50Q131 40 142 42M158 59Q159 46 169 52M91 79Q101 72 106 82',
  },
  {
    id: 'flat-top',
    name: '方块平头',
    back: '',
    front:
      'M74 118L68 92L69 53L77 45L177 46L185 54L184 95L178 116L168 88L165 77L91 77L85 97L83 118Z',
    shine: 'M80 59L173 59M82 69L165 69',
  },
  {
    id: 'sweep',
    name: '慵懒大背头',
    back: 'M74 106Q59 136 65 162L78 157L86 174L94 157L169 159L181 172L184 151L196 152Q192 123 179 103Z',
    front:
      'M74 119Q63 98 68 73Q65 44 96 42Q125 24 158 39Q190 45 188 76L178 116L167 92L167 62Q146 83 135 77Q128 102 115 99L111 83L88 89L82 119Z',
    shine: 'M82 71Q87 48 117 48M100 69Q119 45 146 48M148 62Q164 47 174 65',
  },
  {
    id: 'receding',
    name: '倔强发际线',
    back: '',
    front:
      'M74 121Q59 90 69 66Q76 48 94 48L99 65L87 79L83 116ZM160 49Q182 48 188 68L183 100L177 119L168 92L172 76Z',
    shine: 'M76 77L83 59M177 61L180 82',
  },
  {
    id: 'pony',
    name: '后扎小辫',
    back: 'M170 81Q210 79 207 116Q220 137 208 157L194 151L198 174L181 163Q170 143 179 125L171 111Z',
    front:
      'M73 116Q65 103 68 76Q72 45 99 44Q128 29 156 44Q185 50 185 81L178 116L166 86L163 64Q140 85 91 80L82 115Z',
    shine: 'M83 65Q113 55 145 47M94 72Q130 64 160 55M190 103L196 122',
  },
  {
    id: 'mohawk',
    name: '小山脊',
    back: '',
    front:
      'M77 112L69 85L79 66L89 80L83 113ZM166 78L175 66L186 85L179 111ZM112 73L108 46L117 36L113 20L128 29L143 18L140 36L151 44L145 76L128 67Z',
    shine: 'M126 57L125 39M136 48L138 34',
  },
  {
    id: 'buzz',
    name: '贴头短发',
    back: '',
    front:
      'M75 115Q64 88 76 65Q86 45 126 46Q172 44 181 69L182 99L176 115L169 83Q126 63 88 84L83 115Z',
    shine: 'M88 67L91 61M105 60L109 55M125 58L128 53M146 59L148 54M161 65L164 61',
  },
  { id: 'bald', name: '光头强人', back: '', front: '', shine: '' },
];
export const EYES = [
  {
    id: 'sleepy',
    name: '没睡醒',
    whites:
      'M88 121Q101 112 114 122Q110 136 98 135Q89 133 88 121ZM141 120Q157 109 172 120Q168 133 156 134Q143 133 141 120Z',
    pupils: [
      [104, 125],
      [156, 123],
    ],
    lids: 'M87 121L115 123M141 119L173 121M91 140L109 140M147 139L167 137',
    brows:
      'M85 110L86 101Q102 96 118 107L114 113Q100 106 85 110ZM139 105Q158 95 172 103L175 110L155 107L141 112Z',
  },
  {
    id: 'stern',
    name: '不服气',
    whites:
      'M86 119L116 125Q111 138 97 135Q87 133 86 119ZM140 125L173 117Q173 133 158 135Q146 138 140 125Z',
    pupils: [
      [104, 128],
      [155, 127],
    ],
    lids: 'M86 119L116 125M139 125L174 117',
    brows: 'M84 100L87 109L117 119L120 109ZM137 110L140 118L174 107L173 98Z',
  },
  {
    id: 'skeptic',
    name: '你认真的',
    whites:
      'M87 122Q102 115 116 123Q109 137 97 134Q89 132 87 122ZM141 117Q147 105 162 111Q173 116 171 127Q156 137 145 129Z',
    pupils: [
      [106, 126],
      [155, 121],
    ],
    lids: 'M87 122L116 124M142 117L172 119M93 140L109 139',
    brows: 'M84 108Q100 101 116 110L116 116L85 115ZM139 100Q154 88 171 97L173 104Q153 99 141 107Z',
  },
  {
    id: 'wide',
    name: '刚刚听懂',
    whites:
      'M86 123Q85 108 100 108Q116 108 116 123Q116 138 101 138Q86 138 86 123ZM141 122Q141 107 157 107Q173 108 173 123Q173 137 157 137Q141 137 141 122Z',
    pupils: [
      [102, 125],
      [154, 124],
    ],
    lids: 'M89 143L108 145M147 143L166 142',
    brows: 'M85 98Q101 91 115 101L115 105L86 105ZM141 97Q155 89 173 97L175 103L143 104Z',
  },
  {
    id: 'smug',
    name: '尽在掌握',
    whites:
      'M86 125Q98 117 115 123Q113 136 101 136Q90 136 86 125ZM141 123Q158 113 173 121Q169 135 155 134Q145 132 141 123Z',
    pupils: [
      [106, 127],
      [160, 126],
    ],
    lids: 'M85 124L115 124M141 123L174 121M96 140L108 140',
    brows:
      'M84 110Q100 101 117 110L116 116Q100 111 86 116ZM138 109Q156 98 173 101L176 108Q157 104 141 115Z',
  },
  {
    id: 'wonky',
    name: '左右不同频',
    whites:
      'M86 119Q91 109 102 112Q117 115 115 127Q109 139 96 135Q85 132 86 119ZM141 125Q146 116 160 119L173 125Q165 138 152 135Q144 133 141 125Z',
    pupils: [
      [99, 125],
      [158, 128],
    ],
    lids: 'M85 120L115 121M141 124L173 125M91 141L109 142',
    brows: 'M84 103Q95 94 114 103L116 110Q99 104 86 112ZM138 111Q156 104 174 115L171 120L141 118Z',
  },
];
export const NOSES = [
  {
    id: 'long',
    name: '长鼻梁',
    path: 'M125 123Q125 137 116 151Q111 159 121 164Q134 172 146 160Q143 153 137 150L135 127',
    shade: 'M130 132L128 153Q138 149 143 158Q138 166 126 163Q119 159 124 155Z',
    line: 'M121 161L126 162',
  },
  {
    id: 'bulb',
    name: '蒜头鼻',
    path: 'M120 127L116 144Q105 144 107 156Q110 166 123 164Q136 172 150 160Q154 147 141 144L136 128',
    shade: 'M129 146Q145 143 147 155Q145 162 134 163L121 160Q138 160 136 150Z',
    line: 'M114 155L119 157M140 158L145 155',
  },
  {
    id: 'hook',
    name: '小鹰钩',
    path: 'M125 123L122 142Q124 148 117 154Q114 160 126 161L143 157L139 148L136 125',
    shade: 'M131 132L132 148L139 153L126 157L121 154Z',
    line: 'M130 160L139 158',
  },
  {
    id: 'flat',
    name: '宽鼻头',
    path: 'M120 129L115 145Q102 148 111 160L124 161Q135 166 147 160Q157 151 143 145L138 129',
    shade: 'M125 147Q138 142 147 154L140 161L125 159L113 155Z',
    line: 'M112 155L119 156M139 157L146 154',
  },
  {
    id: 'round',
    name: '圆鼻头',
    path: 'M123 128L118 143Q106 147 114 159Q124 170 140 163Q154 156 143 145L136 128',
    shade: 'M131 143Q147 147 143 157Q137 164 124 160L121 156Q134 160 135 151Z',
    line: 'M116 156L122 158',
  },
  {
    id: 'crooked',
    name: '歪一点',
    path: 'M127 124L122 142L115 148Q109 151 116 160Q125 166 137 162L145 155L136 149L137 127',
    shade: 'M130 139L128 149L138 156L127 161L117 157L124 153Z',
    line: 'M119 157L123 158',
  },
];
export const MOUTHS = [
  {
    id: 'smirk',
    name: '歪嘴笑',
    svg: '<path d="M101 177Q119 188 155 172" fill="none"/><path d="M101 174L99 181M154 169L158 177M119 192L138 190" fill="none" stroke-width="2.5"/>',
  },
  {
    id: 'grin',
    name: '大白牙',
    svg: '<path d="M99 175Q127 185 157 172Q149 197 124 195Q106 193 99 175Z" fill="#f3e9ce"/><path d="M105 183Q129 190 151 182M116 181L117 187M135 181L135 187" fill="none" stroke-width="1.6"/><path d="M119 201L138 199" fill="none" stroke-width="2.3"/>',
  },
  {
    id: 'gap',
    name: '缺门牙',
    svg: '<path d="M99 176Q129 183 157 173Q151 197 128 196Q108 195 99 176Z" fill="#f3e9ce"/><path d="M125 181L136 180L136 189L126 189Z" fill="{{ink}}" stroke="none"/><path d="M107 185Q126 196 151 183" fill="none" stroke-width="1.5"/>',
  },
  {
    id: 'grumpy',
    name: '谁惹我了',
    svg: '<path d="M102 185Q122 170 153 182M102 182L101 188M150 179L155 185" fill="none"/><path d="M116 194Q131 190 143 194" fill="none" stroke="{{shade}}" stroke-width="3"/>',
  },
  {
    id: 'pout',
    name: '不想说话',
    svg: '<path d="M105 180Q119 177 128 182Q139 176 151 177" fill="none"/><path d="M119 190Q131 194 143 187" fill="none" stroke="{{shade}}" stroke-width="4"/>',
  },
  {
    id: 'clench',
    name: '咬牙切齿',
    svg: '<path d="M104 176Q128 168 152 175L155 189Q126 183 102 190Z" fill="#f3e9ce"/><path d="M105 182L153 181M116 175L116 186M129 173L129 185M141 174L141 186" fill="none" stroke-width="1.5"/>',
  },
  {
    id: 'open',
    name: '啊这',
    svg: '<path d="M119 177Q135 170 144 182Q148 195 133 198Q116 199 114 188Q113 181 119 177Z" fill="{{ink}}"/><path d="M118 179Q129 176 140 181L140 185L119 185Z" fill="#f3e9ce" stroke="none"/><path d="M122 195Q130 187 140 194" fill="none" stroke="#b4776f" stroke-width="4"/>',
  },
];
export const BEARDS = [
  { id: 'none', name: '清爽', back: '', front: '' },
  {
    id: 'pencil',
    name: '小胡子',
    back: '',
    front:
      '<path d="M105 171Q118 164 128 169Q140 163 152 168L148 174L131 174L125 173L108 177Z" fill="{{hair}}" stroke-width="1.5"/>',
  },
  {
    id: 'horseshoe',
    name: '八字胡',
    back: '',
    front:
      '<path d="M126 165Q115 161 106 169Q100 178 105 188L112 185Q108 176 118 175L128 173L139 174Q147 177 144 186L151 188Q159 173 147 166Q138 161 130 166Z" fill="{{hair}}" stroke-width="2"/>',
  },
  {
    id: 'goatee',
    name: '下巴一撮',
    back: '<path d="M117 194L128 197L142 192L139 207L130 214L120 207Z" fill="{{hair}}" stroke-width="2.2"/>',
    front: '',
  },
  {
    id: 'stubble',
    name: '胡茬',
    back: '<path d="M89 172L94 179M98 185L102 191M108 196L111 201M120 200L121 205M134 201L134 207M146 197L144 203M157 188L154 194M168 172L165 180" fill="none" stroke="{{hair}}" stroke-width="2"/>',
    front:
      '<path d="M109 171L112 169M118 169L120 168M139 168L141 170M147 169L150 171" stroke="{{hair}}" stroke-width="1.7"/>',
  },
  {
    id: 'boxed',
    name: '短络腮',
    back: '<path d="M83 153L89 157L99 186L114 192Q130 203 149 190L164 184L172 156L178 153L175 181Q165 207 132 214Q101 211 87 187Z" fill="{{hair}}" stroke-width="2.5"/><path d="M97 190L107 199M117 202L125 207M146 199L154 193" fill="none" stroke="{{hairLight}}" stroke-width="2"/>',
    front: '',
  },
];
export const DETAILS = [
  { id: 'plain', name: '无附加细节', svg: '' },
  {
    id: 'freckles',
    name: '雀斑',
    svg: '<g fill="{{shade}}" stroke="none"><circle cx="92" cy="148" r="1.7"/><circle cx="100" cy="151" r="1.4"/><circle cx="95" cy="155" r="1.6"/><circle cx="158" cy="150" r="1.6"/><circle cx="167" cy="147" r="1.7"/><circle cx="164" cy="155" r="1.4"/></g>',
  },
  {
    id: 'cheek',
    name: '脸颊线',
    svg: '<path d="M88 151L94 160M167 149L163 160" fill="none" stroke="{{shade}}" stroke-width="3"/>',
  },
  {
    id: 'scar',
    name: '小伤疤',
    svg: '<path d="M157 143L169 158M157 150L164 145M163 157L170 151" fill="none" stroke="{{shade}}" stroke-width="2.4"/>',
  },
  {
    id: 'eye-bags',
    name: '黑眼圈',
    svg: '<path d="M91 143Q101 148 112 142M145 141Q155 147 168 140" fill="none" stroke="{{shade}}" stroke-width="3.5"/>',
  },
];
export const PARTS = {
  head: HEADS,
  hair: HAIRS,
  eyes: EYES,
  nose: NOSES,
  mouth: MOUTHS,
  beard: BEARDS,
  detail: DETAILS,
};
export const PART_LABELS = {
  head: '头型',
  hair: '发型',
  eyes: '眼神与眉毛',
  nose: '鼻子',
  mouth: '嘴型',
  beard: '胡须',
  detail: '小细节',
  skin: '肤色',
  hairColor: '发色',
  kit: '队服',
};
