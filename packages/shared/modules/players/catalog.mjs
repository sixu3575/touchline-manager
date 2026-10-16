// Public catalog: clients may display these labels; nationality never modifies ability.
export const ATTRIBUTE_GROUPS = {
  technical: {
    label: '技术',
    attributes: {
      finishing: '终结',
      longShots: '远射',
      passing: '传球',
      firstTouch: '停球',
      dribbling: '盘带',
      crossing: '传中',
      tackling: '抢断',
      marking: '盯人',
      heading: '头球',
      setPieces: '定位球',
    },
  },
  mental: {
    label: '意识',
    attributes: {
      vision: '视野',
      decisions: '决策',
      composure: '镇定',
      positioning: '防守站位',
      offTheBall: '无球跑动',
      anticipation: '预判',
      teamwork: '团队配合',
      concentration: '专注',
    },
  },
  physical: {
    label: '身体',
    attributes: {
      acceleration: '爆发力',
      sprintSpeed: '冲刺速度',
      agility: '灵活',
      balance: '平衡',
      strength: '力量',
      stamina: '耐力',
    },
  },
  goalkeeping: {
    label: '门将',
    attributes: {
      reflexes: '反应',
      handling: '手型与接球',
      oneOnOnes: '单刀处理',
      aerialReach: '制空',
      command: '指挥防线',
      distribution: '出球',
    },
  },
};
export const PERSONALITY = {
  professionalism: ['职业态度', '影响训练投入与成长'],
  ambition: ['进取心', '未来用于目标与续约诉求'],
  loyalty: ['忠诚倾向', '未来用于归属与转会选择'],
  temperament: ['情绪稳定', '未来用于冲突与压力事件'],
  leadership: ['领导力', '未来用于队长与更衣室互动'],
  sociability: ['社交意愿', '未来用于队友与媒体互动'],
  adaptability: ['适应能力', '未来用于新环境适应'],
  resilience: ['抗挫能力', '未来用于失利与挫折事件'],
};
export const COUNTRIES = {
  CN: {
    name: '中国',
    first: ['泽宇', '星野', '奕辰', '向北', '明哲', '宇航', '天佑', '一鸣'],
    last: ['林', '陈', '周', '王', '赵', '许', '沈', '陆'],
  },
  JP: {
    name: '日本',
    first: ['悠真', '大翔', '莲', '海斗'],
    last: ['佐藤', '铃木', '高桥', '田中'],
  },
  KR: { name: '韩国', first: ['俊浩', '民宰', '志勋', '贤宇'], last: ['金', '朴', '李', '郑'] },
  BR: {
    name: '巴西',
    first: ['马可', '卢卡斯', '拉斐尔', '蒂亚戈'],
    last: ['席尔瓦', '桑托斯', '科斯塔', '阿尔梅达'],
  },
  AR: {
    name: '阿根廷',
    first: ['迭戈', '马丁', '尼古拉斯', '胡安'],
    last: ['莫雷诺', '罗梅罗', '费尔南德斯', '托雷斯'],
  },
  GB: {
    name: '英国',
    first: ['诺亚', '杰克', '奥利弗', '哈里'],
    last: ['威尔逊', '泰勒', '沃克', '克拉克'],
  },
  DE: {
    name: '德国',
    first: ['莱昂', '约纳斯', '费利克斯', '卢卡斯'],
    last: ['贝克', '米勒', '施密特', '韦伯'],
  },
  FR: {
    name: '法国',
    first: ['雨果', '路易', '亚瑟', '加布里埃尔'],
    last: ['马丁', '杜邦', '莫罗', '洛朗'],
  },
  ES: {
    name: '西班牙',
    first: ['帕布罗', '阿莱克斯', '达尼', '塞尔希奥'],
    last: ['加西亚', '洛佩斯', '罗梅罗', '纳瓦罗'],
  },
  IT: {
    name: '意大利',
    first: ['卢卡', '马特奥', '安德烈亚', '洛伦佐'],
    last: ['罗西', '里奇', '科斯塔', '马里诺'],
  },
  HR: {
    name: '克罗地亚',
    first: ['卢卡', '伊万', '马尔科', '马特奥'],
    last: ['科瓦奇', '佩里奇', '马里奇', '巴比奇'],
  },
  NG: {
    name: '尼日利亚',
    first: ['阿米尔', '伊曼纽尔', '维克托', '萨穆埃尔'],
    last: ['哈桑', '奥科耶', '阿德耶米', '奥科罗'],
  },
};
export const INTERESTS = {
  community: '社区公益',
  family: '家庭时光',
  gaming: '电子游戏',
  music: '音乐',
  fashion: '穿搭',
  fitness: '健身',
};
export const MEDIA_STYLES = { reserved: '低调内敛', candid: '坦率直接', charismatic: '乐于表达' };
export const TRAITS = {
  professional: '自律型',
  ambitious: '追逐荣誉',
  loyal: '重视归属',
  leader: '更衣室领袖',
  social: '社交活跃',
  composed: '沉着冷静',
  private: '珍惜私人空间',
  expressive: '情绪外露',
};
export const SKILLS = ['pace', 'shooting', 'passing', 'defending', 'stamina', 'keeping'];
