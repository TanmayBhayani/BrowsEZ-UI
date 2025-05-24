import { defineConfig } from 'vite';

// Vite config specifically for content scripts
export default defineConfig({
  build: {
    lib: {
      entry: 'src/content-entry.js',
      name: 'ContentScript',
      fileName: 'content-bundled',
      formats: ['iife'] // IIFE format for content scripts
    },
    outDir: '../dist', // Output to extension root dist folder
    rollupOptions: {
      output: {
        // Don't use hashes in filenames for easier referencing
        entryFileNames: '[name].js',
        // External globals for Chrome APIs
        globals: {
          chrome: 'chrome'
        }
      },
      // Mark chrome as external so it's not bundled
      external: ['chrome']
    },
    // Ensure we can use chrome APIs
    target: 'es2017',
    // Don't minify for easier debugging during development
    minify: false
  },
  // No need for dev server for content scripts
  define: {
    // Define any global constants you might need
    'process.env.NODE_ENV': '"production"'
  }
}); 