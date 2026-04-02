import crypto from "crypto";
import { all, get, run } from "../database.js";

export const uid = () => crypto.randomUUID();

export function registerCRUD(app, table, requiredField, { columns, insert, update }) {
  const columnList = columns.split(",").map((column) => column.trim());
  const updateColumns = columnList.slice(1);

  app.get(`/api/${table}`, (_req, res) => {
    try {
      res.json(all(`SELECT * FROM ${table} ORDER BY created_at DESC`));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post(`/api/${table}`, (req, res) => {
    try {
      const body = req.body;
      if (!body[requiredField]) {
        return res.status(400).json({ error: `${requiredField} required` });
      }
      const id = body.id || uid();
      const placeholders = columnList.map(() => "?").join(",");
      run(
        `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`,
        insert(body, id),
      );
      res.status(201).json(get(`SELECT * FROM ${table} WHERE id = ?`, [id]));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put(`/api/${table}/:id`, (req, res) => {
    try {
      const existing = get(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
      if (!existing) return res.status(404).json({ error: "Not found" });
      const body = { ...existing, ...req.body };
      const setClause = updateColumns.map((column) => `${column}=?`).join(",");
      run(
        `UPDATE ${table} SET ${setClause} WHERE id=?`,
        [...update(body), req.params.id],
      );
      res.json(get(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete(`/api/${table}/:id`, (req, res) => {
    try {
      const result = run(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
      if (result.changes === 0) return res.status(404).json({ error: "Not found" });
      res.json({ deleted: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

export function registerRef(app, table, requiredFields) {
  app.get(`/api/ref/${table}`, (_req, res) => {
    try {
      res.json(all(`SELECT * FROM ${table} ORDER BY name`));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post(`/api/ref/${table}`, (req, res) => {
    try {
      const body = req.body;
      for (const field of requiredFields) {
        if (!body[field]) return res.status(400).json({ error: `${field} required` });
      }
      const columns = requiredFields.join(",");
      const placeholders = requiredFields.map(() => "?").join(",");
      run(
        `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`,
        requiredFields.map((field) => body[field]),
      );
      res.status(201).json({ id: get("SELECT last_insert_rowid() as id").id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
