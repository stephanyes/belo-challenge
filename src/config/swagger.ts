export const swaggerConfig = {
  openapi: {
    info: {
      title: 'Belo Challenge API',
      description: 'API para el challenge técnico de Belo',
      version: '1.0.0'
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3000}`,
        description: 'Servidor de desarrollo'
      }
    ]
  }
};

export const swaggerUIConfig = {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: false
  }
};
