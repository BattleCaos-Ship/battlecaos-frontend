import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{ padding: '2rem', maxWidth: 600, margin: '0 auto' }}>
          <h1>Algo salió mal</h1>
          <p role="alert">Error inesperado: {this.state.error.message}</p>
          <button onClick={() => { this.setState({ error: null }); window.location.assign('/'); }}>
            Volver al inicio
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
