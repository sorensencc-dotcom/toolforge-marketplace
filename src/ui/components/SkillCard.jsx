import React from 'react';

export default function SkillCard({ skill, onSelect }) {
  const rating = skill.rating || { average: 0, count: 0 };
  const avgScore = rating.average ? parseFloat(rating.average).toFixed(1) : 'N/A';

  return (
    <div className="skill-card" onClick={() => onSelect(skill.id)}>
      <div className="skill-card-header">
        {skill.icon_url && (
          <img src={skill.icon_url} alt={skill.name} className="skill-icon" />
        )}
        <div className="skill-info">
          <h3>{skill.name}</h3>
          <span className="category-badge">{skill.category}</span>
        </div>
      </div>

      <p className="skill-description">{skill.description}</p>

      <div className="skill-card-footer">
        <div className="rating">
          <span className="stars">★</span>
          <span className="rating-value">{avgScore}</span>
          <span className="rating-count">({rating.count})</span>
        </div>
        <span className="owner">by {skill.owner}</span>
      </div>

      <button className="view-button">INSTALL</button>
    </div>
  );
}
