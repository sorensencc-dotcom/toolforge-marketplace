import React, { useState } from 'react';
import SkillList from './pages/SkillList.jsx';
import SkillDetail from './pages/SkillDetail.jsx';
import Trending from './pages/Trending.jsx';
import SearchBar from './components/SearchBar.jsx';

export default function App() {
  const [view, setView] = useState('list'); // 'list' | 'trending' | 'detail'
  const [selectedSkillId, setSelectedSkillId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState('');

  const handleViewDetail = (skillId) => {
    setSelectedSkillId(skillId);
    setView('detail');
  };

  const handleBack = () => {
    setView('list');
    setSelectedSkillId(null);
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
  };

  const handleCategoryChange = (cat) => {
    setCategory(cat);
    setSearchQuery('');
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Toolforge Marketplace</h1>
        <p>Discover and install skills</p>
        <nav className="app-nav" aria-label="Primary">
          <button
            type="button"
            className={`app-nav-btn ${view !== 'trending' ? 'active' : ''}`}
            aria-current={view !== 'trending' ? 'page' : undefined}
            onClick={() => setView('list')}
          >
            Browse
          </button>
          <button
            type="button"
            className={`app-nav-btn ${view === 'trending' ? 'active' : ''}`}
            aria-current={view === 'trending' ? 'page' : undefined}
            onClick={() => setView('trending')}
          >
            Trending
          </button>
        </nav>
      </header>

      {view === 'list' && (
        <>
          <SearchBar onSearch={handleSearch} onCategoryChange={handleCategoryChange} activeCategory={category} />
          <SkillList
            searchQuery={searchQuery}
            category={category}
            onSelectSkill={handleViewDetail}
          />
        </>
      )}

      {view === 'trending' && <Trending onSelectSkill={handleViewDetail} />}

      {view === 'detail' && <SkillDetail skillId={selectedSkillId} onBack={handleBack} />}
    </div>
  );
}
