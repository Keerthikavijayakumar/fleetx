const routeService = require('../services/routeService');

exports.planRoute = async (req, res, next) => {
    try {
        const route = await routeService.planRoute(req.body);
        res.status(201).json({ message: 'Route planned successfully', route });
    } catch (error) {
        next(error);
    }
};

exports.getAllRoutes = async (req, res, next) => {
    try {
        const routes = await routeService.getAllRoutes();
        res.json(routes);
    } catch (error) {
        next(error);
    }
};

exports.getRouteById = async (req, res, next) => {
    try {
        const route = await routeService.getRouteById(req.params.id);
        res.json(route);
    } catch (error) {
        next(error);
    }
};

exports.deleteRoute = async (req, res, next) => {
    try {
        await routeService.deleteRoute(req.params.id);
        res.json({ message: 'Route deleted successfully' });
    } catch (error) {
        next(error);
    }
};

exports.updateRoute = async (req, res, next) => {
    try {
        const route = await routeService.updateRoute(req.params.id, req.body);
        res.json({ message: 'Route updated successfully', route });
    } catch (error) {
        next(error);
    }
};
