import PropTypes from 'prop-types';
import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import BrandNav from '@/components/BrandNav';
import useSiteMetadata from '@/hooks/useSiteMetadata';
import styles from './style.module.css';

const Layout = ({ children }: React.PropsWithChildren) => {
  const { siteTitle, description, accent, accent2 } = useSiteMetadata();

  useEffect(() => {
    const root = document.documentElement;
    // The brand colour is stored under its own name: the readable accent
    // depends on the theme (a bright accent needs a light page), and
    // theme.css derives it from these two.
    if (accent) root.style.setProperty('--accent-brand', accent);
    if (accent2) root.style.setProperty('--accent-2-brand', accent2);
  }, [accent, accent2]);

  return (
    <>
      <Helmet bodyAttributes={{ class: styles.body }}>
        <html lang="zh-CN" />
        <title>{siteTitle} · ZB ACTIVE</title>
        <meta name="description" content={description} />
        <meta name="keywords" content="running cycling hiking COROS" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <meta name="theme-color" content={accent || '#0b1d33'} />
      </Helmet>
      <Header />
      <main className={styles.main}>{children}</main>
      <Footer />
      {/* On a phone the four sites live in a bottom bar. */}
      <BrandNav />
    </>
  );
};

Layout.propTypes = {
  children: PropTypes.node.isRequired,
};

export default Layout;
