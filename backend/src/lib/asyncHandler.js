// Express 4 ne hvata odbijene Promise-e iz async ruta.
// Ovaj wrapper šalje grešku u centralni error handler.
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = asyncHandler;
