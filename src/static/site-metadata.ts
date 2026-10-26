interface ISiteMetadataResult {
  siteTitle: string;
  siteUrl: string;
  description: string;
  logo: string;
  navLinks: {
    name: string;
    url: string;
  }[];
}

const data: ISiteMetadataResult = {
  siteTitle: 'zhubao315的跑步生涯',
  siteUrl: 'https://zhubao315.github.io/running/',
  logo: 'https://avatars.githubusercontent.com/u/1206487?v=4',
  description: 'zhubao315的跑步生涯',
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
      name: 'X',
      url: 'https://x.com/zhubao315',
    },
  ],
};

export default data
