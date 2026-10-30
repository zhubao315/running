import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import type { FeatureCollection, LineString } from 'geojson';
import Layout from '@/components/Layout';
import JourneyStats from '@/components/JourneyStats';
import RunMap from '@/components/RunMap';
import RunTable from '@/components/RunTable';
import TerrainCard from '@/components/TerrainCard';
import RunningDashboard from '@/components/RunningDashboard';
import SectionHeader from '@/components/RunningDashboard/SectionHeader';
import useActivities from '@/hooks/useActivities';
import { sceneHashOf } from '@/vert/scenes';
import {
  IViewState,
  filterCityRuns,
  filterTitleRuns,
  geoJsonForRuns,
  getBoundsForGeoData,
  scrollToMap,
  titleForShow,
} from '@/utils/utils';
import {
  buildDataset,
  computeTotals,
  filterRunsByScope,
  formatDistanceKm,
  formatNumber,
  scopeLabel,
  type MetricKey,
  type RunScope,
} from '@/utils/runningStats';
import styles from '@/components/RunningDashboard/style.module.css';

type QuickFilter = {
  kind: 'city' | 'title';
  value: string;
} | null;

const Index = () => {
  const { activities } = useActivities();
  const { runs } = useMemo(() => buildDataset(activities), [activities]);

  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] =
    useState<MetricKey>('distance');
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(null);
  const scrollOnSelect = useRef(false);

  const scope: RunScope = useMemo(
    () => ({
      year: selectedYear,
      month: selectedMonth,
      date: selectedDate,
    }),
    [selectedYear, selectedMonth, selectedDate]
  );

  const filterNote = quickFilter
    ? `${quickFilter.kind === 'city' ? '城市' : '类型'} · ${
        quickFilter.value
      }`
    : null;

  // City / run-type shortcuts narrow the whole dashboard, not just the table.
  const baseRuns = useMemo(() => {
    if (!quickFilter) return runs;
    const predicate =
      quickFilter.kind === 'city' ? filterCityRuns : filterTitleRuns;
    return runs.filter((run) => predicate(run, quickFilter.value));
  }, [runs, quickFilter]);

  const scopeRuns = useMemo(
    () => filterRunsByScope(baseRuns, scope),
    [baseRuns, scope]
  );

  const scopeTotals = useMemo(() => computeTotals(scopeRuns), [scopeRuns]);
  const selectedRun =
    selectedRunId === null
      ? undefined
      : runs.find((run) => run.run_id === selectedRunId);

  const mapRuns = useMemo(
    () => (selectedRun ? [selectedRun] : scopeRuns),
    [selectedRun, scopeRuns]
  );

  const fullGeoData = useMemo(() => geoJsonForRuns(mapRuns), [mapRuns]);
  const [geoData, setGeoData] = useState<FeatureCollection<LineString>>(
    () => fullGeoData
  );

  const bounds = useMemo(
    () => getBoundsForGeoData(fullGeoData),
    [fullGeoData]
  );
  const [viewState, setViewState] = useState<IViewState>({ ...bounds });

  useEffect(() => {
    setViewState({ ...bounds });
  }, [bounds]);

  // Draw large scopes in a few frames so MapLibre never blocks the main thread
  // on a single 2,000-polyline mutation.
  useEffect(() => {
    const features = fullGeoData.features;
    if (features.length <= 240 || selectedRun) {
      setGeoData(fullGeoData);
      return;
    }

    const step = Math.max(1, Math.ceil(features.length / 18));
    let count = step;
    setGeoData({ ...fullGeoData, features: features.slice(0, count) });
    const timer = window.setInterval(() => {
      count += step;
      if (count >= features.length) {
        setGeoData(fullGeoData);
        window.clearInterval(timer);
      } else {
        setGeoData({
          ...fullGeoData,
          features: features.slice(0, count),
        });
      }
    }, 70);

    return () => window.clearInterval(timer);
  }, [fullGeoData, selectedRun]);

  const clearScope = useCallback(() => {
    setSelectedYear('all');
    setSelectedMonth(null);
    setSelectedDate(null);
    setSelectedRunId(null);
    setQuickFilter(null);
  }, []);

  const selectYear = useCallback((year: string) => {
    setSelectedYear(year);
    setSelectedMonth(null);
    setSelectedDate(null);
    setSelectedRunId(null);
    setQuickFilter(null);
  }, []);

  const selectMonth = useCallback((year: number, month: number) => {
    setSelectedYear(String(year));
    setSelectedMonth(month);
    setSelectedDate(null);
    setSelectedRunId(null);
    setQuickFilter(null);
  }, []);

  const selectDate = useCallback(
    (date: string) => {
      if (selectedDate === date) {
        setSelectedDate(null);
        setSelectedRunId(null);
        return;
      }
      setSelectedYear(date.slice(0, 4));
      setSelectedMonth(Number(date.slice(5, 7)));
      setSelectedDate(date);
      setSelectedRunId(null);
      setQuickFilter(null);
    },
    [selectedDate]
  );

  const selectRun = useCallback((runId: number | null) => {
    setSelectedRunId(runId);
    if (runId !== null) {
      scrollOnSelect.current = true;
      scrollToMap();
    }
  }, []);

  const selectQuickFilter = useCallback(
    (kind: 'city' | 'title', value: string) => {
      setQuickFilter({ kind, value });
      setSelectedYear('all');
      setSelectedMonth(null);
      setSelectedDate(null);
      setSelectedRunId(null);
      scrollToMap();
    },
    []
  );

  const terrainRef = useRef<HTMLDivElement>(null);

  // A run with a baked scene opens the 3D card below the map; bring it into
  // view once the map's own scroll has landed.
  useEffect(() => {
    if (!scrollOnSelect.current) return;
    scrollOnSelect.current = false;
    if (!selectedRun || !sceneHashOf(selectedRun.run_id)) return;
    const timer = window.setTimeout(() => {
      terrainRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 260);
    return () => window.clearTimeout(timer);
  }, [selectedRun?.run_id]);

  const mapTitle = useMemo(() => {
    if (selectedRun) return titleForShow(selectedRun);
    const label = filterNote ?? scopeLabel(scope);
    if (!scopeRuns.length) return `${label} · 无记录`;
    return `${label} · ${formatNumber(scopeRuns.length)} 次 · ${formatDistanceKm(
      scopeTotals.distanceKm
    )} km`;
  }, [selectedRun, filterNote, scope, scopeRuns, scopeTotals.distanceKm]);

  return (
    <Layout>
      <RunningDashboard
        runs={runs}
        baseRuns={baseRuns}
        scopeRuns={scopeRuns}
        scope={scope}
        filterNote={filterNote}
        selectedMetric={selectedMetric}
        selectedRunId={selectedRunId}
        onSelectYear={selectYear}
        onSelectMonth={selectMonth}
        onSelectDate={selectDate}
        onSelectMetric={setSelectedMetric}
        onSelectRun={selectRun}
        onClearScope={clearScope}
      />

      <section id="explore" className={styles.section}>
        <SectionHeader
          index="05"
          kicker="ACTIVITY EXPLORER"
          title="地图与全部记录"
        >
          <span className={styles.scopePill}>
            {filterNote ?? scopeLabel(scope)}
          </span>
        </SectionHeader>

        <div className="space-y-4">
          <div className="card overflow-hidden">
            <RunMap
              title={mapTitle}
              viewState={viewState}
              geoData={geoData}
              setViewState={setViewState}
            />
          </div>

          <div ref={terrainRef} className="scroll-mt-20">
            {selectedRun ? (
              <TerrainCard run={selectedRun} onClose={() => selectRun(null)} />
            ) : null}
          </div>

          <div className="card p-4 lg:p-6">
            <RunTable
              runs={scopeRuns}
              selectedRunId={selectedRunId}
              onSelectRun={selectRun}
              onClearScope={clearScope}
            />
          </div>
        </div>
      </section>

      <JourneyStats
        changeCity={(city) => selectQuickFilter('city', city)}
        changeTitle={(title) => selectQuickFilter('title', title)}
      />

      {/* Enable Audiences in Vercel Analytics: https://vercel.com/docs/concepts/analytics/audiences/quickstart */}
      {import.meta.env.VERCEL && <Analytics />}
    </Layout>
  );
};

export default Index;
