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
      name: 'X',
      url: 'https://x.com/zhubao315',
    },
  ],
};

export default data
