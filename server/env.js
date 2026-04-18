try {
  process.loadEnvFile?.('.env');
} catch (error) {
  if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
    throw error;
  }
}
