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
  accent: '#38BDF8',
  accent2: '#0EA5E9',
  sportLabel: '跑步',
  repoUrl: 'https://github.com/zhubao315/running',
  navLinks: [
    {
      name: 'health',
      url: 'https://zhubao315.github.io/health/',
    },
    {
      name: 'running',
      url: 'https://zhubao315.github.io/running/',
    },
    {
      name: 'cycling',
      url: 'https://zhubao315.github.io/cycling/',
    },
    {
      name: 'hiking',
      url: 'https://zhubao315.github.io/hiking/',
    },
    {
      name: 'X',
      url: 'https://x.com/zhubao315',
    },
  ],
};

export default data
