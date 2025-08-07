import React, { useState } from 'react';

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