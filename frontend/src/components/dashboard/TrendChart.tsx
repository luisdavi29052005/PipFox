
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';

interface TrendChartProps {
  data: Array<{
    day: string;
    posts: number;
    comments: number;
  }>;
}

export default function TrendChart({ data }: TrendChartProps) {
  return (
    <motion.div
      className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200/50 dark:border-gray-700/50"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Tendência 30 Dias
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Posts capturados vs Comentários publicados
        </p>
      </div>
      
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis 
              dataKey="day" 
              className="text-xs"
              tick={{ fontSize: 12, fill: 'currentColor' }}
            />
            <YAxis 
              className="text-xs"
              tick={{ fontSize: 12, fill: 'currentColor' }}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: 'rgb(17 24 39)',
                border: 'none',
                borderRadius: '8px',
                color: 'white'
              }}
            />
            <Line 
              type="monotone" 
              dataKey="posts" 
              stroke="#8b5cf6" 
              strokeWidth={2}
              name="Posts"
              dot={{ fill: '#8b5cf6', r: 3 }}
            />
            <Line 
              type="monotone" 
              dataKey="comments" 
              stroke="#10b981" 
              strokeWidth={2}
              name="Comentários"
              dot={{ fill: '#10b981', r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
