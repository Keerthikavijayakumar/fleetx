const jwt = require('jsonwebtoken');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');

function getPhoneVariants(raw) {
    const compact = String(raw || '').replace(/[^\d+]/g, '');
    const digits = compact.replace(/^\+/, '');
    const variants = new Set([compact, digits]);

    if (digits.startsWith('91') && digits.length > 10) {
        variants.add(digits.slice(2));
    }
    if (digits.length === 10) {
        variants.add(`+91${digits}`);
        variants.add(`91${digits}`);
    }

    return Array.from(variants).filter(Boolean);
}

exports.register = async (req, res, next) => {
    try {
        const { username, email, password, role } = req.body;

        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ message: 'User with this email or username already exists' });
        }

        const user = new User({ username, email, password, role: role || 'driver' });
        await user.save();

        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });

        res.status(201).json({
            message: 'Registration successful',
            token,
            user: { id: user._id, username: user.username, email: user.email, role: user.role },
        });
    } catch (error) {
        next(error);
    }
};

exports.login = async (req, res, next) => {
    try {
        // Accept email OR phone number in the `emailOrPhone` field (or legacy `email`)
        const identifier = (req.body.emailOrPhone || req.body.email || '').trim();
        const { password } = req.body;
        const compactPhone = identifier.replace(/[\s-]/g, '');

        // Determine if identifier looks like a phone number (digits, optional + prefix)
        const isPhone = /^[+\d][\d\s\-]{7,}$/.test(identifier);
        const query = isPhone
            ? { phone: { $in: getPhoneVariants(compactPhone) } }
            : { email: identifier };

        const user = await User.findOne(query);
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials. Please check your email/phone and password.' });
        }

        let isMatch = await user.comparePassword(password);
        if (!isMatch && (user.role === 'driver' || user.role === 'assistant') && password === 'arm') {
            // Backward compatibility: older accounts might have been created before
            // the common password policy. Normalize them to "arm" on first login.
            user.password = 'arm';
            await user.save();
            isMatch = true;
        }
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials. Please check your email/phone and password.' });
        }

        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                phone: user.phone,
                fullName: user.fullName,
                photoPath: user.photoPath,
                monthlySalary: user.monthlySalary || 0,
            },
        });
    } catch (error) {
        next(error);
    }
};

exports.getProfile = async (req, res, next) => {
    try {
        res.json({ user: req.user });
    } catch (error) {
        next(error);
    }
};

exports.adminCreateUser = async (req, res, next) => {
    try {
        const {
            username, email, password, role,
            fullName, driverLicenceNumber, address, aadharNumber,
            phone, additionalPhone, dateOfBirth, experienceYears, monthlySalary,
        } = req.body;

        const compactPhone = phone ? String(phone).replace(/[\s-]/g, '') : '';
        const duplicateChecks = [{ email }, { username }];
        if (compactPhone) duplicateChecks.push({ phone: compactPhone });
        const existingUser = await User.findOne({ $or: duplicateChecks });
        if (existingUser) {
            return res.status(400).json({ message: 'User with this email, username, or phone already exists' });
        }

        const safeRole = role || 'driver';
        if ((safeRole === 'driver' || safeRole === 'assistant') && !compactPhone) {
            return res.status(400).json({ message: 'Phone number is required for driver/assistant login' });
        }
        const userData = {
            username,
            email,
            // Driver/assistant credentials are standardized: common password "arm"
            password: (safeRole === 'driver' || safeRole === 'assistant') ? 'arm' : password,
            role: safeRole,
            fullName:            fullName || undefined,
            driverLicenceNumber: driverLicenceNumber || undefined,
            address:             address || undefined,
            aadharNumber:        aadharNumber || undefined,
            phone:               compactPhone || undefined,
            additionalPhone:     additionalPhone || undefined,
            experienceYears:     experienceYears ? Number(experienceYears) : 0,
            monthlySalary:       monthlySalary ? Number(monthlySalary) : 0,
        };
        if (dateOfBirth) userData.dateOfBirth = new Date(dateOfBirth);
        if (req.file) {
            // Store relative path so it works across environments
            userData.photoPath = 'uploads/photos/' + req.file.filename;
        }

        const user = new User(userData);
        await user.save();

        res.status(201).json({
            message: 'User created successfully',
            user: { id: user._id, username: user.username, email: user.email, role: user.role },
        });
    } catch (error) {
        next(error);
    }
};

exports.adminListUsers = async (req, res, next) => {
    try {
        const role = req.query.role;
        const query = role ? { role } : {};
        const users = await User.find(query).select('-password').sort({ createdAt: -1 });
        res.json({ users });
    } catch (error) {
        next(error);
    }
};

exports.adminGetUser = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ user });
    } catch (error) {
        next(error);
    }
};

exports.adminUpdateUser = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const {
            username, email, password, role,
            fullName, driverLicenceNumber, address, aadharNumber,
            phone, additionalPhone, dateOfBirth, experienceYears, monthlySalary,
        } = req.body;

        if (username && username !== user.username) {
            const existingUsername = await User.findOne({ username, _id: { $ne: user._id } });
            if (existingUsername) return res.status(400).json({ message: 'Username is already in use' });
            user.username = username;
        }

        if (email && email !== user.email) {
            const existingEmail = await User.findOne({ email, _id: { $ne: user._id } });
            if (existingEmail) return res.status(400).json({ message: 'Email is already in use' });
            user.email = email;
        }

        if (phone !== undefined) {
            const compactPhone = phone ? String(phone).replace(/[\s-]/g, '') : '';
            if (compactPhone) {
                const existingPhone = await User.findOne({ phone: compactPhone, _id: { $ne: user._id } });
                if (existingPhone) return res.status(400).json({ message: 'Phone number is already in use' });
            }
            user.phone = compactPhone || undefined;
        }

        if (role) {
            user.role = role;
            if (role === 'driver' || role === 'assistant') {
                user.password = 'arm';
            }
        }
        if (password) {
            user.password = (user.role === 'driver' || user.role === 'assistant') ? 'arm' : password;
        }

        if (fullName !== undefined) user.fullName = fullName || undefined;
        if (driverLicenceNumber !== undefined) user.driverLicenceNumber = driverLicenceNumber || undefined;
        if (address !== undefined) user.address = address || undefined;
        if (aadharNumber !== undefined) user.aadharNumber = aadharNumber || undefined;
        if (additionalPhone !== undefined) user.additionalPhone = additionalPhone || undefined;
        if (experienceYears !== undefined) user.experienceYears = experienceYears ? Number(experienceYears) : 0;
        if (monthlySalary !== undefined) user.monthlySalary = monthlySalary ? Number(monthlySalary) : 0;
        if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : undefined;

        if (req.file) {
            if (user.photoPath) {
                const oldPhotoAbsolute = path.join(__dirname, '..', user.photoPath);
                if (fs.existsSync(oldPhotoAbsolute)) {
                    try { fs.unlinkSync(oldPhotoAbsolute); } catch (_err) {}
                }
            }
            user.photoPath = 'uploads/photos/' + req.file.filename;
        }

        await user.save();
        const safeUser = await User.findById(user._id).select('-password');
        res.json({ message: 'User updated successfully', user: safeUser });
    } catch (error) {
        next(error);
    }
};

exports.adminDeleteUser = async (req, res, next) => {
    try {
        if (String(req.user?._id) === String(req.params.id)) {
            return res.status(400).json({ message: 'You cannot delete your own account' });
        }

        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (user.photoPath) {
            const photoAbsolute = path.join(__dirname, '..', user.photoPath);
            if (fs.existsSync(photoAbsolute)) {
                try { fs.unlinkSync(photoAbsolute); } catch (_err) {}
            }
        }

        await User.findByIdAndDelete(req.params.id);
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        next(error);
    }
};
