import { dbQuery } from '../db/index.js';
import { createAuditLog } from '../services/audit_service.js';

export async function getProfiles(req, res) {
  try {
    const profiles = await dbQuery.all('SELECT * FROM service_profiles ORDER BY profile_id ASC');
    res.json(profiles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function createProfile(req, res) {
  try {
    const { name, vlan_id, vlan_profile, vlan_template, wan_config_template, pppoe_username_template, pppoe_password_template } = req.body;
    if (!name || !vlan_id) {
      return res.status(400).json({ error: 'Nama profil dan VLAN ID wajib diisi' });
    }

    const finalVlanProfile = vlan_profile ? vlan_profile.trim() : (parseInt(vlan_id, 10) === 101 ? 'PPPoE' : (parseInt(vlan_id, 10) === 200 ? 'PPPoE2' : 'PPPoE'));

    const result = await dbQuery.run(
      `INSERT INTO service_profiles (name, vlan_id, vlan_profile, vlan_template, wan_config_template, pppoe_username_template, pppoe_password_template)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        vlan_id,
        finalVlanProfile,
        vlan_template || `vlan ${vlan_id} tag`,
        wan_config_template || 'IP_MODE=PPPoE;NAT=ENABLE',
        pppoe_username_template || '{user}@isp.net',
        pppoe_password_template || 'pass1234'
      ]
    );

    await createAuditLog({
      user: req.user,
      action: 'Buat Service Profile',
      details: { profile_id: result.lastID, name, vlan_id, vlan_profile: finalVlanProfile }
    });

    res.status(201).json({ message: 'Service Profile berhasil dibuat', profile_id: result.lastID, vlan_profile: finalVlanProfile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function updateProfile(req, res) {
  try {
    const { profile_id } = req.params;
    const { name, vlan_id, vlan_profile, vlan_template, wan_config_template, pppoe_username_template, pppoe_password_template } = req.body;

    const profile = await dbQuery.get('SELECT * FROM service_profiles WHERE profile_id = ?', [profile_id]);
    if (!profile) {
      return res.status(404).json({ error: 'Service Profile tidak ditemukan' });
    }

    const finalVlanProfile = vlan_profile !== undefined
      ? (vlan_profile ? vlan_profile.trim() : null)
      : profile.vlan_profile;

    await dbQuery.run(
      `UPDATE service_profiles SET name = ?, vlan_id = ?, vlan_profile = ?, vlan_template = ?, wan_config_template = ?, pppoe_username_template = ?, pppoe_password_template = ? WHERE profile_id = ?`,
      [
        name || profile.name,
        vlan_id || profile.vlan_id,
        finalVlanProfile,
        vlan_template || profile.vlan_template,
        wan_config_template || profile.wan_config_template,
        pppoe_username_template || profile.pppoe_username_template,
        pppoe_password_template || profile.pppoe_password_template,
        profile_id
      ]
    );

    await createAuditLog({
      user: req.user,
      action: 'Update Service Profile',
      details: { profile_id, name: name || profile.name, vlan_id: vlan_id || profile.vlan_id, vlan_profile: finalVlanProfile }
    });

    res.json({ message: 'Service Profile berhasil diperbarui' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function deleteProfile(req, res) {
  try {
    const { profile_id } = req.params;
    const profile = await dbQuery.get('SELECT * FROM service_profiles WHERE profile_id = ?', [profile_id]);
    if (!profile) {
      return res.status(404).json({ error: 'Service Profile tidak ditemukan' });
    }

    await dbQuery.run('DELETE FROM service_profiles WHERE profile_id = ?', [profile_id]);

    await createAuditLog({
      user: req.user,
      action: 'Hapus Service Profile',
      details: { profile_id, name: profile.name }
    });

    res.json({ message: 'Service Profile berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
