import path from 'path';
import { fileURLToPath } from 'url';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development';

export default {
  mode: isDev ? 'development' : 'production',
  devtool: isDev ? 'inline-source-map' : false,
  
  entry: {
    // Extension scripts
    background: './src/background/index.ts',
    content: './src/content/index.ts',
    
    // UI applications
    sidebar: './src/ui/sidebar/index.tsx',
    settings: './src/ui/settings/index.tsx',
  },
  
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@background': path.resolve(__dirname, 'src/background'),
      '@content': path.resolve(__dirname, 'src/content'),
      '@assets': path.resolve(__dirname, 'src/assets'),
    },
  },
  
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
            compilerOptions: {
              noEmit: false,
            }
          }
        },
        exclude: /node_modules/,
      },
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: {
            allowTsInNodeModules: true,
          },
        },
      },
      {
        test: /\.css$/,
        use: [
          isDev ? 'style-loader' : MiniCssExtractPlugin.loader,
          'css-loader',
        ],
      },
      {
        test: /\.(png|jpg|jpeg|gif|svg)$/,
        type: 'asset/resource',
      },
    ],
  },
  
  plugins: [
    // Copy static assets
    new CopyWebpackPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { 
          from: 'src/assets', 
          to: 'assets', 
          noErrorOnMissing: true,
          globOptions: {
            ignore: ['**/seedrandom.min.js']
          }
        },
        { from: 'src/assets/seedrandom.min.js', to: 'seedrandom.min.js' },
      ],
    }),
    
    // Generate HTML for UI apps
    new HtmlWebpackPlugin({
      template: 'src/ui/sidebar/index.html',
      filename: 'sidebar.html',
      chunks: ['sidebar'],
    }),
    
    new HtmlWebpackPlugin({
      template: 'src/ui/settings/index.html',
      filename: 'settings.html',
      chunks: ['settings'],
    }),
    
    // Extract CSS in production
    ...(!isDev ? [new MiniCssExtractPlugin({
      filename: '[name].css',
    })] : []),
  ],
  
  optimization: {
    splitChunks: {
      chunks: (chunk) => {
        // Don't split chunks for extension scripts (background, content)
        // Only split chunks for UI applications (sidebar, settings)
        return chunk.name !== 'background' && chunk.name !== 'content';
      },
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: (chunk) => chunk.name !== 'background' && chunk.name !== 'content',
        },
        shared: {
          name: 'shared',
          minChunks: 2,
          chunks: (chunk) => chunk.name !== 'background' && chunk.name !== 'content',
          enforce: true,
        },
      },
    },
  },
  
  // Specific settings for different entry points
  target: ['web', 'es2020'],
  
  // Externals configuration to exclude React and UI libraries from service worker
  externals: ({context, request}, callback) => {
    // For background script only, exclude React and UI libraries
    if (context && context.includes('background')) {
      if (
        request === 'react' || 
        request === 'react-dom' || 
        request === 'use-sync-external-store' ||
        request === 'scheduler' ||
        request.startsWith('react/') ||
        request.startsWith('react-dom/') ||
        request.startsWith('@ui/') ||
        request.startsWith('zustand')
      ) {
        return callback(null, 'undefined');
      }
    }
    callback();
  },
}; 