import React, { useState, useEffect } from 'react';
import TrendingSection from '../components/TrendingSection.jsx';
import trendingFixture from '../fixtures/trending.json';

/**
 * Trending page — 30-day window is the primary sort; 7-day is a toggle.
 *
 * Fixtures-first: reads local fixture now. To go live, replace loadTrending()
 * with: axios.get(`/api/v1/skills/trending?window=${window}`).then(r => r.data.data)
 */
export default function Trending({ onSelectSkill }) {
  const [window, setWindow] = useState('30d'); // 30-day primary per design doc
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    // SWAP POINT: replace with live API call — same {data:[...]} contract.
    loadTrending(window)
      .then((data) => { if (active) setSkills(data); })
      .catch((err) => { if (active) setError(err.message || 'Failed to load trending skills'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [window]);

  return (
    <div className="trending-page skill-list-container">
      <div className="trending-controls">
        <span className="field-label" id="window-label">Window</span>
        <div className="window-toggle" role="group" aria-labelledby="window-label">
          <button
            type="button"
            className={`window-btn ${window === '7d' ? 'active' : ''}`}
            aria-pressed={window === '7d'}
            onClick={() => setWindow('7d')}
          >
            7 Days
          </button>
          <button
            type="button"
            className={`window-btn ${window === '30d' ? 'active' : ''}`}
            aria-pressed={window === '30d'}
            onClick={() => setWindow('30d')}
          >
            30 Days
          </button>
        </div>
      </div>

      {error && <div className="error-message" role="alert">{error}</div>}
      {loading && <div className="loading" role="status">Loading trending skills…</div>}
      {!loading && !error && (
        <TrendingSection window={window} skills={skills} onSelect={onSelectSkill} />
      )}
    </div>
  );
}

/**
 * Fixture-backed loader. Structured so the return shape matches the live endpoint
 * response ({data: Skill[]}) for a drop-in swap.
 * @returns {Promise<Array>}
 */
function loadTrending(window) {
  const bucket = trendingFixture[window] || trendingFixture['30d'] || { data: [] };
  return Promise.resolve(bucket.data || []);
}
