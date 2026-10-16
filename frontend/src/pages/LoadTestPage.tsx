import React from 'react';
import { CsvBatchPage } from './CsvBatchPage';

interface LoadTestPageProps {
  onDataProcessed?: () => void;
}

export const LoadTestPage: React.FC<LoadTestPageProps> = ({ onDataProcessed }) => {
  return <CsvBatchPage onDataProcessed={onDataProcessed} />;
};
