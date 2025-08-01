import { useState } from 'react';
import { WikiInterface } from './components/WikiInterface';

export default function App() {
  return (
    <div className="min-h-screen bg-background">
      <WikiInterface />
    </div>
  );
}