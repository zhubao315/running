import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import type { FeatureCollection, LineString } from 'geojson';
import Layout from '@/components/Layout';
import JourneyStats from '@/components/JourneyStats';
import RunMap from '@/components/RunMap';
import RunTable from '@/components/RunTable';
import TerrainCard from '@/components/TerrainCard';
import RunningDashboard from '@/components/RunningDashboard';
import DayDetail from '@/components/RunningDashboard/DayDetail';
import RunCalendar from '@/components/RunningDashboard/RunCalendar';
import SectionHeader from '@/components/RunningDashboard/SectionHeader';
import TrainingAnalysis from '@/components/RunningDashboard/TrainingAnalysis';
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
  buildCalendar,
  buildDataset,
  buildYearSeries,
  availableYears,
  computeTotals,
  filterRunsByScope,
  formatDistanceKm,
  formatNumber,
  scopeLabel,
  type MetricKey,
  type RunScope,
} from '@/utils/runningStats';
import {
  ensureTracks,
  subscribeTracks,
  trackProgress,
} from '@/utils/tracks';
import { readUrlState, writeUrlState } from '@/utils/urlState';
import styles from '@/components/RunningDashboard/style.module.css';

type QuickFilter = {
  kind: 'city' | 'title';
  value: string;
} | null;

const Index = () => {
  const { activities } = useActivities();
  const { runs } = useMemo(() => buildDataset(activities), [activities]);

  // A link may address a day, a year or one activity: read it before the
  // first paint so the page opens on what the link talks about.
  const urlState = useMemo(() => readUrlState(), []);
  const deepLinkDate = useMemo(() => {
    if (!urlState.date) return null;
    // ignore a date the data does not cover — an empty view helps nobody
    const dates = runs.map((run) => run.date);
    if (!dates.length) return null;
    const first = dates[0];
    const last = dates[dates.length - 1];
    return urlState.date >= first && urlState.date <= last ? urlState.date : null;
  }, [runs, urlState.date]);

  // Open on the newest year with real records instead of all history; the
  // dataset is imported statically, so this resolves on the very first render.
  const [selectedYear, setSelectedYear] = useState(() => {
    if (deepLinkDate) return deepLinkDate.slice(0, 4);
    if (urlState.year) return urlState.year;
    const years = availableYears(runs);
    return years.length ? String(years[years.length - 1]) : 'all';
  });
  const [selectedMonth, setSelectedMonth] = useState<number | null>(() =>
    deepLinkDate ? Number(deepLinkDate.slice(5, 7)) : null
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(
    () => deepLinkDate
  );
  const [selectedMetric, setSelectedMetric] =
    useState<MetricKey>('distance');
  const [selectedRunId, setSelectedRunId] = useState<number | null>(() => {
    if (urlState.runId === null) return null;
    return runs.some((run) => run.run_id === urlState.runId)
      ? urlState.runId
      : null;
  });
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(null);
  const scrollOnSelect = useRef(false);
  const deepLinkRunId = urlState.runId;

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

  // The bundle carries no geometry: ask for the years this view draws, then
  // rebuild the lines when a batch lands.
  const [tracksToken, setTracksToken] = useState(0);
  useEffect(
    () => subscribeTracks(() => setTracksToken((token) => token + 1)),
    []
  );
  useEffect(() => {
    ensureTracks(mapRuns);
  }, [mapRuns]);

  const tracks = useMemo(
    () => trackProgress(mapRuns),
    [mapRuns, tracksToken]
  );

  const fullGeoData = useMemo(
    () => geoJsonForRuns(mapRuns),
    [mapRuns, tracksToken]
  );
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

  // Keep the address bar in step with the view, so a copied link shows the
  // same day / year / activity.
  useEffect(() => {
    writeUrlState({
      date: selectedDate,
      year: selectedDate ? null : selectedYear === 'all' ? null : selectedYear,
      runId: selectedRunId,
    });
  }, [selectedDate, selectedYear, selectedRunId]);

  // A deep link opens the day it talks about: bring the calendar into view.
  useEffect(() => {
    if (!deepLinkDate) return;
    const timer = window.setTimeout(() => {
      document
        .getElementById('calendar')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [deepLinkDate]);

  // A deep link to one activity opens its terrain, if it has a scene.
  useEffect(() => {
    if (!deepLinkRunId || !selectedRun) return;
    const timer = window.setTimeout(() => {
      terrainRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [deepLinkRunId, selectedRun]);

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
    // While a year's geometry is still on its way the map would otherwise show
    // fewer lines than the scope contains, so say so in the caption.
    const trackNote =
      tracks.wanted === 0 || tracks.present === tracks.wanted
        ? ''
        : tracks.failedBuckets.length > 0
          ? ` · ${formatNumber(tracks.failedBuckets.length)} 个年份的轨迹加载失败`
          : ` · 轨迹加载中 ${formatNumber(tracks.present)}/${formatNumber(tracks.wanted)}`;
    if (selectedRun) return `${titleForShow(selectedRun)}${trackNote}`;
    const label = filterNote ?? scopeLabel(scope);
    if (!scopeRuns.length) return `${label} · 无记录`;
    return `${label} · ${formatNumber(scopeRuns.length)} 次 · ${formatDistanceKm(
      scopeTotals.distanceKm
    )} km${trackNote}`;
  }, [selectedRun, filterNote, scope, scopeRuns, scopeTotals.distanceKm, tracks]);

  const yearSeries = useMemo(() => buildYearSeries(baseRuns), [baseRuns]);
  const latestYear = yearSeries.length
    ? yearSeries[yearSeries.length - 1].year
    : new Date().getFullYear();
  const calendarYear = selectedDate
    ? Number(selectedDate.slice(0, 4))
    : selectedMonth
      ? Number(selectedYear)
      : selectedYear !== 'all'
        ? Number(selectedYear)
        : latestYear;
  const calendar = useMemo(
    () => buildCalendar(baseRuns, calendarYear),
    [baseRuns, calendarYear]
  );
  const dayRuns = useMemo(
    () =>
      selectedDate
        ? scopeRuns.filter((run) => run.date === selectedDate)
        : [],
    [scopeRuns, selectedDate]
  );
  const minYear = yearSeries.length ? yearSeries[0].year : calendarYear;
  const maxYear = latestYear;

  return (
    <Layout>
      <RunningDashboard
        runs={runs}
        baseRuns={baseRuns}
        scopeRuns={scopeRuns}
        scope={scope}
        filterNote={filterNote}
        selectedMetric={selectedMetric}
        onSelectYear={selectYear}
        onSelectMonth={selectMonth}
        onSelectMetric={setSelectedMetric}
        onClearScope={clearScope}
      />

      <section id="journey" className={styles.section}>
        <JourneyStats
          changeCity={(city) => selectQuickFilter('city', city)}
          changeTitle={(title) => selectQuickFilter('title', title)}
          onViewRun={selectRun}
        />
      </section>

      <section id="training" className={styles.section}>
        <SectionHeader index="05" kicker="TRAINING ANALYSIS" title="训练分析">
          <span className={styles.scopePill}>
            {filterNote ?? scopeLabel(scope)}
          </span>
        </SectionHeader>

        <TrainingAnalysis
          runs={scopeRuns}
          scopeLabel={filterNote ?? scopeLabel(scope)}
        />
      </section>

      <section id="explore" className={styles.section}>
        <SectionHeader
          index="06"
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
              changeYear={(year) =>
                selectYear(year === 'Total' ? 'all' : year)
              }
              thisYear={selectedYear === 'all' ? 'Total' : selectedYear}
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

      <section id="calendar" className={styles.section}>
        <div className="card p-4 lg:p-6">
          <RunCalendar
            calendar={calendar}
            selectedMonth={selectedMonth}
            selectedDate={selectedDate}
            minYear={minYear}
            maxYear={maxYear}
            onSelectMonth={selectMonth}
            onSelectDate={selectDate}
            onSelectYear={selectYear}
          />
          {selectedDate && dayRuns.length ? (
            <DayDetail
              date={selectedDate}
              runs={dayRuns}
              selectedRunId={selectedRunId}
              onSelectRun={selectRun}
              onClose={() => selectDate(selectedDate)}
            />
          ) : null}
        </div>
      </section>

      {/* Enable Audiences in Vercel Analytics: https://vercel.com/docs/concepts/analytics/audiences/quickstart */}
      {import.meta.env.VERCEL && <Analytics />}
    </Layout>
  );
};

export default Index;
