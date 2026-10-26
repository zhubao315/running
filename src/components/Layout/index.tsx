import PropTypes from 'prop-types';
import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import useSiteMetadata from '@/hooks/useSiteMetadata';
import styles from './style.module.css';

const Layout = ({ children }: React.PropsWithChildren) => {
  const { siteTitle, description, accent, accent2 } = useSiteMetadata();

  useEffect(() => {
    const root = document.documentElement;
    if (accent) root.style.setProperty('--accent', accent);
    if (accent2) root.style.setProperty('--accent-2', accent2);
  }, [accent, accent2]);

  return (
    <>
      <Helmet bodyAttributes={{ class: styles.body }}>
        <html lang="zh-CN" />
        <title>{siteTitle}</title>
        <meta name="description" content={description} />
        <meta name="keywords" content="running cycling hiking COROS" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <meta name="theme-color" content={accent || '#0b0d10'} />
      </Helmet>
      <Header />
      <main className={styles.main}>{children}</main>
      <Footer />
    </>
  );
};

Layout.propTypes = {
  children: PropTypes.node.isRequired,
};

export default Layout;
