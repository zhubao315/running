import React, {useRef, useCallback, useEffect} from 'react';
import Map, {Layer, Source, FullscreenControl, NavigationControl, MapRef} from 'react-map-gl/maplibre';
import useActivities from '@/hooks/useActivities';
import useTheme from '@/hooks/useTheme';
import {
  IS_CHINESE,
  PROVINCE_FILL_COLOR,
  COUNTRY_FILL_COLOR,
  USE_DASH_LINE,
} from '@/utils/const';
import { Coordinate, IViewState, geoJsonForMap } from '@/utils/utils';
import RunMarker from './RunMarker';
import RunMapButtons from './RunMapButtons';
import styles from './style.module.css';
import { FeatureCollection } from 'geojson';
import { FilterSpecification } from 'maplibre-gl';
import { RPGeometry } from '@/static/run_countries';
import 'maplibre-gl/dist/maplibre-gl.css';

interface IRunMapProps {
  title: string;
  viewState: IViewState;
  setViewState: (_viewState: IViewState) => void;
  geoData: FeatureCollection<RPGeometry>;
  changeYear: (_year: string) => void;
  thisYear: string;
}

const RunMap = ({
  title,
  viewState,
  setViewState,
  geoData,
  changeYear,
  thisYear,
}: IRunMapProps) => {
  const { countries, provinces } = useActivities();
  const { theme } = useTheme();
  const mapRef = useRef<MapRef | null>(null);
  const mapRefCallback = useCallback((ref: MapRef) => {
    if (ref) mapRef.current = ref;
  }, []);
  // for geojson format
  const filterProvinces = [
    'in',
    'name',
    ...provinces,
  ] as unknown as FilterSpecification;
  const filterCountries = [
    'in',
    'name',
    ...countries,
  ] as unknown as FilterSpecification;

  const initGeoDataLength = geoData.features.length;
  const isBigMap = (viewState.zoom ?? 0) <= 3;
  if (isBigMap && IS_CHINESE) {
    // Show boundary and line together, combine geoData(only when not combine yet)
    if(geoData.features.length === initGeoDataLength){
      geoData = {
          "type": "FeatureCollection",
          "features": geoData.features.concat(geoJsonForMap().features)
      };
    }
  }

  const isSingleRun =
    geoData.features.length === 1 &&
    geoData.features[0].geometry.coordinates.length;
  let startLon = 0;
  let startLat = 0;
  let endLon = 0;
  let endLat = 0;
  if (isSingleRun) {
    const points = geoData.features[0].geometry.coordinates as Coordinate[];
    [startLon, startLat] = points[0];
    [endLon, endLat] = points[points.length - 1];
  }
  const dash =
    USE_DASH_LINE && !isSingleRun && !isBigMap ? [2, 2] : undefined;
  // The province and country fills have to read on both basemaps: the light
  // style needs darker outlines, the dark style lighter ones.
  const provinceFill = theme === 'light' ? PROVINCE_FILL_COLOR : '#1f6f92';
  const countryFill = theme === 'light' ? COUNTRY_FILL_COLOR : 'rgb(148,163,184)';
  const onMove = React.useCallback(({ viewState }: { viewState: IViewState }) => {
    setViewState(viewState);
  }, []);
  const style: React.CSSProperties = {
    width: '100%',
    height: 'clamp(360px, 48vw, 600px)',
  };
  const fullscreenButton: React.CSSProperties = {
    position: 'absolute',
    marginTop: '29.2px',
    right: '0px',
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (mapRef.current) {
        mapRef.current.getMap().resize();
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  return (
    <Map
      {...viewState}
      onMove={onMove}
      style={style}
      /* The basemap follows the theme: the light page gets the light style,
         the dark page the dark one. react-map-gl re-adds the GeoJSON source
         and its layers after a style change, so the routes stay. */
      mapStyle={
        theme === 'light'
          ? 'https://tiles.openfreemap.org/styles/positron'
          : 'https://tiles.openfreemap.org/styles/dark'
      }
      ref={mapRefCallback}
    >
      <Source id="data" type="geojson" data={geoData}>
        <Layer
          id="province"
          type="fill"
          paint={{
            'fill-color': provinceFill,
          }}
          filter={filterProvinces}
        />
        <Layer
          id="countries"
          type="fill"
          paint={{
            'fill-color': countryFill,
            // in China, fill a bit lighter while already filled provinces
            'fill-opacity': ["case", ["==", ["get", "name"], '中国'], 0.1, 0.5],
          }}
          filter={filterCountries}
        />
        <Layer
          id="runs2"
          type="line"
          paint={{
            'line-color':  ['get', 'color'],
            'line-width': isBigMap ? 2 : 3,
            ...(dash ? { 'line-dasharray': dash } : {}),
            'line-opacity': isSingleRun || isBigMap ? 1 : 0.85,
            'line-blur': 0.3,
          }}
          layout={{
            'line-join': 'round',
            'line-cap': 'round',
          }}
        />
      </Source>
      <RunMapButtons changeYear={changeYear} thisYear={thisYear} />
      {isSingleRun && (
        <RunMarker
          startLat={startLat}
          startLon={startLon}
          endLat={endLat}
          endLon={endLon}
        />
      )}
      <span className={styles.runTitle}>{title}</span>
      <FullscreenControl style={fullscreenButton} />
      <NavigationControl showCompass={false} position={'bottom-right'} />
    </Map>
  );
};

export default RunMap;
