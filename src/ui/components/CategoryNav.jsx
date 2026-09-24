import React, { useEffect } from 'react';

/**
 * CategoryNav — category selector with per-category skill counts.
 * Persists the active category to the URL (?category=<slug>).
 *
 * @param {object}   props
 * @param {Array}   [props.categories]  Category[] ({slug, displayName, skillCount}).
 * @param {string}  [props.active]      Active category slug ('' = all).
 * @param {(slug:string)=>void} props.onSelect
 */
export default function CategoryNav({ categories = [], active = '', onSelect }) {
  // Keep the URL in sync so the active category survives reload / share.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.history) return;
    const params = new URLSearchParams(window.location.search);
    if (active) params.set('category', active);
    else params.delete('category');
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ''}`;
    window.history.replaceState(null, '', next);
  }, [active]);

  const totalCount = categories.reduce((sum, c) => sum + (c.skillCount || 0), 0);

  const handleChange = (e) => {
    if (onSelect) onSelect(e.target.value);
  };

  return (
    <nav className="category-nav" aria-label="Skill categories">
      <label className="field-label" htmlFor="category-nav-select">Category</label>
      <div className="category-nav-select-wrap">
        <select
          id="category-nav-select"
          className="category-nav-select"
          value={active}
          onChange={handleChange}
        >
          <option value="">All categories ({totalCount})</option>
          {categories.map((cat) => (
            <option key={cat.slug} value={cat.slug}>
              {cat.displayName} ({cat.skillCount || 0})
            </option>
          ))}
        </select>
        <span className="category-nav-caret" aria-hidden="true">▾</span>
      </div>
    </nav>
  );
}
