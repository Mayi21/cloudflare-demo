import React, { useEffect, useMemo, useState } from 'react';
import * as echarts from 'echarts';

function App() {
  // State for Base64 converter
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');

  // State for Cron scheduler
  const [cronInput, setCronInput] = useState('* * * * *');
  const [schedule, setSchedule] = useState([]);
  const [cronError, setCronError] = useState('');

  // State for URL Shortener
  const [longUrl, setLongUrl] = useState('');
  const [shortUrl, setShortUrl] = useState('');
  const [shortenError, setShortenError] = useState('');

  // Analytics Dashboard state
  const [overview, setOverview] = useState(null);
  const [series, setSeries] = useState([]);
  const [countries, setCountries] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [range, setRange] = useState('24h');
  const [interval, setIntervalStr] = useState('1h');

  const baseApiUrl = useMemo(() => (import.meta.env.VITE_API_URL || '').replace(/\/$/, ''), []);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [o, t, c, s] = await Promise.all([
          fetch(`${baseApiUrl}/api/metrics/overview?range=${range}`),
          fetch(`${baseApiUrl}/api/metrics/timeseries?range=${range}&interval=${interval}`),
          fetch(`${baseApiUrl}/api/metrics/countries?range=${range}`),
          fetch(`${baseApiUrl}/api/metrics/status?range=${range}`),
        ]);
        const [oJson, tJson, cJson, sJson] = await Promise.all([o.json(), t.json(), c.json(), s.json()]);
        setOverview(oJson);
        setSeries(tJson.series || []);
        setCountries(cJson.items || []);
        setStatuses(sJson.items || []);
      } catch (e) {
        // ignore
      }
    };
    fetchAll();
    const id = setInterval(fetchAll, 8000);
    return () => clearInterval(id);
  }, [baseApiUrl, range, interval]);

  useEffect(() => {
    const lineEl = document.getElementById('chart-line');
    const pieEl = document.getElementById('chart-pie');
    const mapEl = document.getElementById('chart-map');
    if (!lineEl || !pieEl || !mapEl) return;
    const line = echarts.init(lineEl);
    const pie = echarts.init(pieEl);
    const map = echarts.init(mapEl);
    line.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['PV', 'UV'] },
      xAxis: { type: 'category', data: series.map(s => s.ts) },
      yAxis: { type: 'value' },
      series: [
        { type: 'line', name: 'PV', data: series.map(s => s.pv) },
        { type: 'line', name: 'UV', data: series.map(s => s.uv) },
      ]
    });
    pie.setOption({
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie',
        radius: '60%',
        data: statuses.map(i => ({ name: String(i.status), value: i.cnt })),
      }]
    });

    // Load world map geojson dynamically; fallback to bar if failed
    const loadWorld = async () => {
      try {
        const res = await fetch('https://fastly.jsdelivr.net/npm/echarts@5/map/json/world.json');
        const geoJson = await res.json();
        echarts.registerMap('world', geoJson);
        map.setOption({
          tooltip: { trigger: 'item' },
          visualMap: { min: 0, max: Math.max(1, ...countries.map(c => c.cnt)), left: 'left', top: 'bottom', text: ['High','Low'], calculable: true },
          series: [{
            type: 'map',
            map: 'world',
            roam: true,
            data: countries.map(c => ({ name: c.country || 'Unknown', value: c.cnt })),
          }]
        });
      } catch (e) {
        map.setOption({
          tooltip: { trigger: 'axis' },
          xAxis: { type: 'category', data: countries.map(c => c.country || 'Unknown') },
          yAxis: { type: 'value' },
          series: [{ type: 'bar', data: countries.map(c => c.cnt) }]
        });
      }
    };
    loadWorld();
    const onResize = () => { line.resize(); pie.resize(); };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); line.dispose(); pie.dispose(); map.dispose(); };
  }, [series, statuses, countries]);

  const handleEncode = () => {
    try {
      setOutput(btoa(input));
      setError('');
    } catch (e) {
      setError('Invalid input for encoding.');
      setOutput('');
    }
  };

  const handleDecode = () => {
    try {
      setOutput(atob(input));
      setError('');
    } catch (e) {
      setError('Invalid Base64 string for decoding.');
      setOutput('');
    }
  };

  const handleCronSubmit = async () => {
    setCronError('');
    setSchedule([]);
    try {
      const baseApiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const fetchUrl = `${baseApiUrl}/api/cron/schedule`;
      const response = await fetch(fetchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cron: cronInput }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'An error occurred while fetching the schedule.');
      }

      setSchedule(data.schedule);
    } catch (err) {
      setCronError(err.message);
    }
  };

  const handleShortenUrl = async () => {
    setShortenError('');
    setShortUrl('');
    try {
      const baseApiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const fetchUrl = `${baseApiUrl}/api/shorten`;
      const response = await fetch(fetchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: longUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'An error occurred while shortening the URL.');
      }

      setShortUrl(data.shortUrl);
    } catch (err) {
      setShortenError(err.message);
    }
  };

  return (
    <div className="container mt-5">
      {/* Base64 Section */}
      <h1 className="mb-4">Base64 Encoder/Decoder</h1>
      <div className="form-group">
        <textarea
          className="form-control"
          rows="5"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter text to encode or decode"
        ></textarea>
      </div>
      <button className="btn btn-primary me-2" onClick={handleEncode}>
        Encode
      </button>
      <button className="btn btn-secondary" onClick={handleDecode}>
        Decode
      </button>
      {output && (
        <div className="mt-4">
          <h3>Result:</h3>
          <pre className="alert alert-success">{output}</pre>
        </div>
      )}
      {error && (
        <div className="mt-4">
          <div className="alert alert-danger">{error}</div>
        </div>
      )}

      <hr className="my-5" />

      {/* Analytics Dashboard */}
      <h2 className="mb-3">Analytics Dashboard</h2>
      <div className="row mb-3">
        <div className="col-auto">
          <label className="form-label">Range</label>
          <select className="form-select" value={range} onChange={e => setRange(e.target.value)}>
            <option value="1h">1h</option>
            <option value="6h">6h</option>
            <option value="12h">12h</option>
            <option value="24h">24h</option>
            <option value="7d">7d</option>
          </select>
        </div>
        <div className="col-auto">
          <label className="form-label">Interval</label>
          <select className="form-select" value={interval} onChange={e => setIntervalStr(e.target.value)}>
            <option value="5m">5m</option>
            <option value="15m">15m</option>
            <option value="1h">1h</option>
          </select>
        </div>
      </div>
      {overview && (
        <div className="row mb-3">
          <div className="col">
            <div className="alert alert-primary">Total Requests: {overview.totalRequests}</div>
          </div>
          <div className="col">
            <div className="alert alert-success">Unique Visitors: {overview.uniqueVisitors}</div>
          </div>
        </div>
      )}
      <div className="row">
        <div className="col-md-8">
          <div id="chart-line" style={{ height: 360 }} />
        </div>
        <div className="col-md-4">
          <div id="chart-pie" style={{ height: 360 }} />
        </div>
      </div>
      <div className="row mt-3">
        <div className="col-12">
          <div id="chart-map" style={{ height: 420 }} />
        </div>
      </div>

      {/* Cron Scheduler Section */}
      <h2 className="mb-4">Cron Expression Scheduler</h2>
      <div className="form-group">
        <label htmlFor="cron-input" className="form-label">Enter cron expression:</label>
        <input
          id="cron-input"
          type="text"
          className="form-control"
          value={cronInput}
          onChange={(e) => setCronInput(e.target.value)}
        />
      </div>
      <button className="btn btn-info mt-2" onClick={handleCronSubmit}>
        Get Next 5 Run Times
      </button>
      {schedule.length > 0 && (
        <div className="mt-4">
          <h3>Next 5 Scheduled Times:</h3>
          <ul className="list-group">
            {schedule.map((time, index) => (
              <li key={index} className="list-group-item">
                {new Date(time).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      )}
      {cronError && (
        <div className="mt-4">
          <div className="alert alert-danger">{cronError}</div>
        </div>
      )}

      <hr className="my-5" />

      {/* URL Shortener Section */}
      <h2 className="mb-4">URL Shortener</h2>
      <div className="form-group">
        <label htmlFor="long-url-input" className="form-label">Enter long URL:</label>
        <input
          id="long-url-input"
          type="url"
          className="form-control"
          value={longUrl}
          onChange={(e) => setLongUrl(e.target.value)}
          placeholder="https://example.com/very/long/url/to/shorten"
        />
      </div>
      <button className="btn btn-success mt-2" onClick={handleShortenUrl}>
        Shorten URL
      </button>
      {shortUrl && (
        <div className="mt-4">
          <h3>Your Short URL:</h3>
          <div className="input-group">
            <input type="text" className="form-control" value={shortUrl} readOnly />
            <button className="btn btn-outline-secondary" onClick={() => navigator.clipboard.writeText(shortUrl)}>
              Copy
            </button>
          </div>
        </div>
      )}
      {shortenError && (
        <div className="mt-4">
          <div className="alert alert-danger">{shortenError}</div>
        </div>
      )}
    </div>
  );
}

export default App;