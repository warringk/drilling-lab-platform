import React from 'react';

export const Select = ({ value, onValueChange, children, ...props }) => {
  return (
    <select
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2"
      {...props}
    >
      {children}
    </select>
  );
};

export const SelectTrigger = ({ children, className = '', ...props }) => {
  return <div className={className}>{children}</div>;
};

export const SelectValue = () => null;

export const SelectContent = ({ children }) => children;

export const SelectItem = ({ value, children }) => {
  return <option value={value}>{children}</option>;
};