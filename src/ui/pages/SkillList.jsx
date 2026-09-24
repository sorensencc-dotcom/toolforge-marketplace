import React, { useState, useEffect } from 'react';
import axios from 'axios';
import SkillCard from '../components/SkillCard.jsx';

export default function SkillList({ searchQuery, category, onSelectSkill }) {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const LIMIT = 20;

  useEffect(() => {
    fetchSkills(0);
  }, [searchQuery, category]);

  const fetchSkills = async (offset) => {
    setLoading(true);
    setError(null);
    try {
      let url = '/api/v1/skills';
      const params = new URLSearchParams({
        limit: LIMIT,
        offset: offset,
      });

      if (searchQuery) {
        url = '/api/v1/skills/search';
        params.set('q', searchQuery);
      } else if (category) {
        params.set('category', category);
      }

      url += '?' + params.toString();
      const response = await axios.get(url);
      const data = response.data.data || [];

      if (offset === 0) {
        setSkills(data);
      } else {
        setSkills((prev) => [...prev, ...data]);
      }

      setHasMore(data.length === LIMIT);
      setPage(offset / LIMIT + 1);
    } catch (err) {
      setError(err.message || 'Failed to load skills');
      setSkills([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = () => {
    fetchSkills(page * LIMIT);
  };

  return (
    <div className="skill-list-container">
      {error && <div className="error-message">{error}</div>}

      {loading && skills.length === 0 && <div className="loading">Loading skills...</div>}

      <div className="skill-grid">
        {skills.map((skill) => (
          <SkillCard key={skill.id} skill={skill} onSelect={onSelectSkill} />
        ))}
      </div>

      {skills.length === 0 && !loading && (
        <div className="empty-state">
          <p>No skills found. Try a different search.</p>
        </div>
      )}

      {hasMore && !loading && skills.length > 0 && (
        <div className="load-more">
          <button onClick={handleLoadMore} className="load-more-button">
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
