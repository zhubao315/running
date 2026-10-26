interface ISiteMetadataResult {
  siteTitle: string;
  siteUrl: string;
  description: string;
  tagline?: string;
  accent?: string;
  accent2?: string;
  sportLabel?: string;
  repoUrl?: string;
  logo: string;
  navLinks: {
    name: string;
    url: string;
  }[];
}

const data: ISiteMetadataResult = {
  siteTitle: 'zhubao315 的跑步生涯',
  siteUrl: 'https://zhubao315.github.io/running/',
  logo: 'https://avatars.githubusercontent.com/u/1206487?v=4',
  description: 'zhubao315 的跑步生涯',
  tagline: '用脚步丈量城市，也用数据记住每一次出发。',
  accent: '#e0ed5e',
  accent2: '#a3e635',
  sportLabel: '跑步',
  repoUrl: 'https://github.com/zhubao315/running',
  navLinks: [
    {
      name: '跑步',
      url: 'https://zhubao315.github.io/running/',
    },
    {
      name: '骑行',
      url: 'https://zhubao315.github.io/cycling/',
    },
    {
      name: '徒步',
      url: 'https://zhubao315.github.io/hiking/',
    },
    {
      name: '健康',
      url: 'https://zhubao315.github.io/health/',
    },
    {
      name: 'X',
      url: 'https://x.com/zhubao315',
    },
  ],
};

export default data
