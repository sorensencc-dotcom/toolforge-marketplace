import React, { useState } from 'react';

const CATEGORIES = [
  { id: '', label: 'ALL CATEGORIES' },
  { id: 'linting', label: 'LINTING' },
  { id: 'auth', label: 'AUTH' },
  { id: 'analytics', label: 'ANALYTICS' },
  { id: 'deployment', label: 'DEPLOYMENT' },
  { id: 'testing', label: 'TESTING' },
  { id: 'devtools', label: 'DEVTOOLS' },
  { id: 'security', label: 'SECURITY' },
];

export default function SearchBar({ onSearch, onCategoryChange, activeCategory = '' }) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch(query);
  };

  const handleCategorySelect = (cat) => {
    onCategoryChange(cat);
  };

  return (
    <div className="search-bar">
      <form onSubmit={handleSubmit} className="search-form">
        <input
          type="text"
          placeholder="Search skills..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="search-input"
        />
        <button type="submit" className="search-button">SEARCH</button>
      </form>

      <div className="category-filter">
        <label>FILTER BY CATEGORY:</label>
        <div className="category-buttons">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategorySelect(cat.id)}
              className={`category-btn ${activeCategory === cat.id ? 'active' : ''}`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
