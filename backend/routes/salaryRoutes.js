const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const salaryController = require('../controllers/salaryController');

const admin = authorize('admin');

// Assign salary to a trip (admin only)
router.post('/', auth, admin, salaryController.assignSalary);

// Get salaries with filters
router.get('/', auth, admin, salaryController.getSalaries);

// Get specific salary record
router.get('/:id', auth, admin, salaryController.getSalaryById);

// Update salary record
router.put('/:id', auth, admin, salaryController.updateSalary);

// Delete salary record
router.delete('/:id', auth, admin, salaryController.deleteSalary);

module.exports = router;
