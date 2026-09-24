import React, { useState } from 'react';
import RatingStars from './RatingStars.jsx';

const PAGE_SIZE = 5;

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * ReviewList — paginated list of ratings with loading / empty / error states.
 *
 * @param {object}   props
 * @param {Array}   [props.reviews]  Rating[] ({id, score, reviewText, userId, createdAt, updatedAt}).
 * @param {boolean} [props.loading]
 * @param {string|null} [props.error]
 */
export default function ReviewList({ reviews = [], loading = false, error = null }) {
  const [visible, setVisible] = useState(PAGE_SIZE);

  if (loading) {
    return <div className="review-list-status loading" role="status">Loading reviews…</div>;
  }

  if (error) {
    return (
      <div className="review-list-status error-message" role="alert">
        {typeof error === 'string' ? error : 'Failed to load reviews.'}
      </div>
    );
  }

  if (!reviews.length) {
    return (
      <div className="review-list-status empty-state">
        <p>No reviews yet. Be the first to rate this skill.</p>
      </div>
    );
  }

  const shown = reviews.slice(0, visible);
  const hasMore = visible < reviews.length;

  return (
    <div className="review-list">
      <ul className="review-items">
        {shown.map((r) => (
          <li key={r.id} className="review-item">
            <div className="review-item-head">
              <RatingStars value={r.score} size="sm" />
              <span className="review-item-meta">
                {formatDate(r.updatedAt || r.createdAt)}
                {r.updatedAt && r.updatedAt !== r.createdAt ? ' (edited)' : ''}
              </span>
            </div>
            {r.reviewText && <p className="review-item-text">{r.reviewText}</p>}
          </li>
        ))}
      </ul>

      {hasMore && (
        <div className="review-list-more">
          <button
            type="button"
            className="load-more-button"
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
          >
            Show More Reviews
          </button>
        </div>
      )}
    </div>
  );
}
