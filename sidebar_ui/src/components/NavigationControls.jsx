import React from 'react';

const NavigationControls = ({ currentPosition, totalResults, onNavigate, visible }) => {
  if (!visible || totalResults <= 0) {
    return null;
  }

  return (
    <div className="navigation-controls">
      <div className="navigation-buttons">
        <button 
          onClick={() => onNavigate('prev')} 
          disabled={currentPosition <= 1}
          className="nav-button prev"
        >
          Previous
        </button>
        <span className="position-counter">
          {currentPosition}/{totalResults}
        </span>
        <button 
          onClick={() => onNavigate('next')} 
          disabled={currentPosition >= totalResults}
          className="nav-button next"
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default NavigationControls; 