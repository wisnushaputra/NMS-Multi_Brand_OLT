import { Router } from 'express';
import * as authCtrl from '../controllers/auth_controller.js';
import * as userCtrl from '../controllers/user_controller.js';
import * as devCtrl from '../controllers/device_controller.js';
import * as onuCtrl from '../controllers/onu_controller.js';
import * as profCtrl from '../controllers/profile_controller.js';
import * as logCtrl from '../controllers/log_controller.js';
import * as topoCtrl from '../controllers/topology_controller.js';
import * as integCtrl from '../controllers/integration_controller.js';
import * as pollerCtrl from '../controllers/poller_controller.js';
import * as loopCtrl from '../controllers/loop_controller.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// Public Auth Routes
router.post('/auth/login', authCtrl.login);

// All routes below this middleware require a valid JWT token
router.use(authenticateToken);

// Protected Auth Routes
router.get('/auth/me', authCtrl.getMe);

// User Management (Superadmin Only)
router.get('/users', requireRole('superadmin'), userCtrl.getUsers);
router.post('/users', requireRole('superadmin'), userCtrl.createUser);
router.put('/users/:id', requireRole('superadmin'), userCtrl.updateUser);
router.delete('/users/:id', requireRole('superadmin'), userCtrl.deleteUser);

// Devices (Management & Adapter CLI)
router.get('/devices', devCtrl.getDevices);
router.post('/devices', requireRole('superadmin', 'noc_engineer'), devCtrl.createDevice);
router.put('/devices/:device_id', requireRole('superadmin', 'noc_engineer'), devCtrl.updateDevice);
router.delete('/devices/:device_id', requireRole('superadmin', 'noc_engineer'), devCtrl.deleteDevice);
router.get('/devices/:device_id/status', devCtrl.getDeviceStatus);
router.post('/devices/:device_id/execute', requireRole('superadmin', 'noc_engineer'), devCtrl.executeDeviceCommand);
router.post('/devices/:device_id/detect-cards', requireRole('superadmin', 'noc_engineer'), devCtrl.detectDeviceCards);
router.post('/devices/detect-cards-raw', requireRole('superadmin', 'noc_engineer'), devCtrl.detectCardsRaw);
router.get('/devices/:device_id/onu-types', devCtrl.getDeviceONUTypes);

// Provisioning & ONUs
router.get('/onus', onuCtrl.getONUs);
router.post('/onu/provision', requireRole('superadmin', 'noc_engineer', 'field_technician'), onuCtrl.provisionONU);
router.post('/onu/:onu_id/pppoe', requireRole('superadmin', 'noc_engineer', 'field_technician'), onuCtrl.pushPPPoE);
router.delete('/onu/:onu_id', requireRole('superadmin', 'noc_engineer'), onuCtrl.deleteONU);
router.get('/onu/unconfigured', requireRole('superadmin', 'noc_engineer', 'field_technician'), onuCtrl.getUnconfiguredONUs);
router.get('/onu/:onu_id/status', onuCtrl.getONUStatus);
router.get('/onus/:onu_id/status', onuCtrl.getONUStatus);
router.get('/onus/:onu_id/optical-history', pollerCtrl.getONUOpticalHistory);
router.get('/devices/:deviceId/ports/:portId/next-onu-index', onuCtrl.getNextAvailableONUIndex);
router.post('/onu/pre-check-optical', onuCtrl.checkPreOpticalPower);
router.post('/onu/:onu_id/replace', requireRole('superadmin', 'noc_engineer', 'field_technician'), onuCtrl.replaceONU);
router.post('/onu/:onu_id/reboot', requireRole('superadmin', 'noc_engineer', 'field_technician'), onuCtrl.rebootONU);
router.post('/onu/:onu_id/change-profile', requireRole('superadmin', 'noc_engineer', 'field_technician'), onuCtrl.changeONUProfile);
router.post('/onus/:onu_id/change-profile', requireRole('superadmin', 'noc_engineer', 'field_technician'), onuCtrl.changeONUProfile);
router.post('/onu/:onu_id/simulate-state', requireRole('superadmin', 'noc_engineer', 'field_technician'), onuCtrl.simulateONUState);
router.post('/onus/:onu_id/simulate-state', requireRole('superadmin', 'noc_engineer', 'field_technician'), onuCtrl.simulateONUState);
router.post('/devices/:device_id/sync-onus', requireRole('superadmin', 'noc_engineer', 'field_technician'), onuCtrl.syncONUsFromOLT);
router.post('/onus/sync', requireRole('superadmin', 'noc_engineer', 'field_technician'), onuCtrl.syncONUsFromOLT);
router.post('/onu/:onu_id/repush-config', requireRole('superadmin', 'noc_engineer', 'field_technician'), onuCtrl.repushONUConfig);
router.post('/onus/:onu_id/repush-config', requireRole('superadmin', 'noc_engineer', 'field_technician'), onuCtrl.repushONUConfig);

// Loop Protection & Broadcast Storm Mitigation
router.get('/loop-protection/incidents', loopCtrl.getLoopIncidents);
router.post('/loop-protection/scan', requireRole('superadmin', 'noc_engineer'), loopCtrl.scanLoopback);
router.post('/loop-protection/resolve/:incident_id', requireRole('superadmin', 'noc_engineer', 'field_technician'), loopCtrl.resolveLoopIncident);
router.post('/loop-protection/simulate', requireRole('superadmin', 'noc_engineer'), loopCtrl.simulateLoopIncident);

// Service Profiles
router.get('/service-profiles', profCtrl.getProfiles);
router.post('/service-profiles', requireRole('superadmin', 'noc_engineer'), profCtrl.createProfile);
router.put('/service-profiles/:profile_id', requireRole('superadmin', 'noc_engineer'), profCtrl.updateProfile);
router.delete('/service-profiles/:profile_id', requireRole('superadmin', 'noc_engineer'), profCtrl.deleteProfile);

// Audit Logs (Superadmin, NOC Engineer, Helpdesk)
router.get('/logs', requireRole('superadmin', 'noc_engineer', 'helpdesk'), logCtrl.getAuditLogs);

// Topology Visualization Graph
router.get('/topology', topoCtrl.getTopology);

// External Integrations & Notifications (Superadmin Only)
router.get('/integrations/settings', requireRole('superadmin'), integCtrl.getIntegrationSettings);
router.post('/integrations/settings', requireRole('superadmin'), integCtrl.saveIntegrationSettings);
router.get('/genieacs/status', requireRole('superadmin', 'noc_engineer'), integCtrl.getGenieACSStatus);
router.post('/genieacs/sync', requireRole('superadmin'), integCtrl.syncGenieACS);
router.post('/genieacs/device/:cpe_id/reboot', requireRole('superadmin', 'noc_engineer'), integCtrl.rebootGenieACSCPE);
router.post('/notifications/test', requireRole('superadmin'), integCtrl.sendTestNotification);
router.post('/notifications/simulate', requireRole('superadmin'), integCtrl.simulateIncidentAlert);

// Background Poller Daemon & Real-time SSE Events
router.get('/poller/status', pollerCtrl.getPollerStatus);
router.post('/poller/toggle', requireRole('superadmin', 'noc_engineer'), pollerCtrl.togglePoller);
router.post('/poller/run', requireRole('superadmin', 'noc_engineer'), pollerCtrl.triggerManualSweep);
router.get('/events/stream', pollerCtrl.eventsStream);

export default router;
