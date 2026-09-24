import React from 'react';
import RatingStars from './RatingStars.jsx';

const DIRECTION_LABEL = { up: 'Trending up', down: 'Trending down', stable: 'Holding steady' };
const DIRECTION_GLYPH = { up: '▲', down: '▼', stable: '►' };

function formatGrowth(pct) {
  if (pct === null || pct === undefined) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${Number(pct).toFixed(1)}%`;
}

/**
 * TrendingSection — grid of trending skills with growth badge + direction indicator.
 *
 * @param {object}   props
 * @param {'7d'|'30d'} [props.window]   Active window (affects heading copy).
 * @param {Array}   [props.skills]      Skill[] with {growthPct, trendDirection}.
 * @param {(id)=>void} [props.onSelect] Navigate to skill detail.
 */
export default function TrendingSection({ window = '30d', skills = [], onSelect }) {
  const windowLabel = window === '7d' ? 'past 7 days' : 'past 30 days';

  if (!skills.length) {
    return (
      <section className="trending-section" aria-labelledby="trending-heading">
        <h2 id="trending-heading" className="section-heading">Trending</h2>
        <div className="empty-state"><p>No trending data available right now.</p></div>
      </section>
    );
  }

  return (
    <section className="trending-section" aria-labelledby="trending-heading">
      <h2 id="trending-heading" className="section-heading">
        Trending <span className="section-subheading">{windowLabel}</span>
      </h2>

      <ol className="trending-grid">
        {skills.map((skill, i) => {
          const dir = skill.trendDirection || 'stable';
          return (
            <li key={skill.id} className="trending-card">
              <button
                type="button"
                className="trending-card-btn"
                onClick={() => onSelect && onSelect(skill.id)}
                aria-label={`${skill.name}, rank ${i + 1}, ${DIRECTION_LABEL[dir]} ${formatGrowth(skill.growthPct)}`}
              >
                <div className="trending-card-head">
                  <span className="trending-rank" aria-hidden="true">{i + 1}</span>
                  <span className={`trend-badge trend-${dir}`}>
                    <span className="trend-glyph" aria-hidden="true">{DIRECTION_GLYPH[dir]}</span>
                    {formatGrowth(skill.growthPct)}
                  </span>
                </div>
                <h3 className="trending-name">{skill.name}</h3>
                <span className="category-badge">{skill.category}</span>
                <p className="trending-desc">{skill.description}</p>
                <div className="trending-card-foot">
                  <RatingStars value={skill.rating ? skill.rating.average : 0} size="sm" />
                  <span className="trending-installs">
                    {(window === '7d' ? skill.installs7d : skill.installs30d) ?? 0} installs
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
