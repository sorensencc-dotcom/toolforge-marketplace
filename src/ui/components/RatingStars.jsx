import React from 'react';

/**
 * RatingStars — 1..5 star display or input.
 *
 * @param {object}   props
 * @param {number}   props.value       Current rating (0..5; fractional allowed for display).
 * @param {boolean} [props.editable]   When true, renders interactive star buttons.
 * @param {(n:number)=>void} [props.onChange] Called with the chosen score (1..5) when editable.
 * @param {string}  [props.size]       'sm' | 'md' | 'lg' (default 'md').
 */
export default function RatingStars({ value = 0, editable = false, onChange, size = 'md' }) {
  const rounded = Math.round(value);

  if (editable) {
    const handleKey = (e, n) => {
      // Allow arrow-key adjustment for keyboard users.
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (onChange) onChange(Math.max(1, rounded - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (onChange) onChange(Math.min(5, rounded + 1));
      }
    };

    return (
      <div
        className={`rating-stars rating-stars-${size} rating-stars-editable`}
        role="radiogroup"
        aria-label="Rating"
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = n <= rounded;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={n === rounded}
              aria-label={`${n} star${n === 1 ? '' : 's'}`}
              className={`star-btn ${filled ? 'filled' : 'empty'}`}
              onClick={() => onChange && onChange(n)}
              onKeyDown={(e) => handleKey(e, n)}
              tabIndex={n === (rounded || 1) ? 0 : -1}
            >
              <span aria-hidden="true">{filled ? '★' : '☆'}</span>
            </button>
          );
        })}
      </div>
    );
  }

  const label = value ? `Rated ${Number(value).toFixed(1)} out of 5` : 'Not yet rated';
  return (
    <span
      className={`rating-stars rating-stars-${size}`}
      role="img"
      aria-label={label}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} aria-hidden="true" className={n <= rounded ? 'star filled' : 'star empty'}>
          {n <= rounded ? '★' : '☆'}
        </span>
      ))}
    </span>
  );
}
