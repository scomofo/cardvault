import crypto from "crypto";
import { all, get, run } from "../database.js";
import { toCamel, toCamelArray, toSnake } from "../mappers/recordMappers.js";
import { isObject } from "../validation/common.js";

export const uid = () => crypto.randomUUID();

export function registerCRUD(app, table, requiredField, { columns, insert, update, fieldMap = {} }) {
  const columnList = columns.split(",").map((column) => column.trim());
  const updateColumns = columnList.slice(1);

  app.get(`/api/${table}`, (_req, res) => {
    try {
      res.json(toCamelArray(all(`SELECT * FROM ${table} ORDER BY created_at DESC`), fieldMap));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post(`/api/${table}`, (req, res) => {
    try {
      if (!isObject(req.body)) {
        return res.status(400).json({ error: "body must be an object" });
      }
      const body = toSnake(req.body);
      if (!body[requiredField]) {
        return res.status(400).json({ error: `${requiredField} required` });
      }
      const id = body.id || uid();
      const placeholders = columnList.map(() => "?").join(",");
      run(
        `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`,
        insert(body, id),
      );
      res.status(201).json(toCamel(get(`SELECT * FROM ${table} WHERE id = ?`, [id]), fieldMap));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put(`/api/${table}/:id`, (req, res) => {
    try {
      if (!isObject(req.body)) {
        return res.status(400).json({ error: "body must be an object" });
      }
      const existing = get(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
      if (!existing) return res.status(404).json({ error: "Not found" });
      if (Object.keys(req.body).length === 0) return res.status(400).json({ error: "request body required" });
      const body = { ...existing, ...toSnake(req.body) };
      const setClause = updateColumns.map((column) => `${column}=?`).join(",");
      run(
        `UPDATE ${table} SET ${setClause} WHERE id=?`,
        [...update(body), req.params.id],
      );
      res.json(toCamel(get(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]), fieldMap));
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

export function registerRef(app, table, requiredFields, { fieldMap = {}, orderBy = "name" } = {}) {
  app.get(`/api/ref/${table}`, (_req, res) => {
    try {
      res.json(toCamelArray(all(`SELECT * FROM ${table} ORDER BY ${orderBy}`), fieldMap));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post(`/api/ref/${table}`, (req, res) => {
    try {
      if (!isObject(req.body)) {
        return res.status(400).json({ error: "body must be an object" });
      }
      const body = toSnake(req.body);
      for (const field of requiredFields) {
        if (!body[field]) return res.status(400).json({ error: `${field} required` });
      }
      const columns = requiredFields.join(",");
      const placeholders = requiredFields.map(() => "?").join(",");
      run(
        `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`,
        requiredFields.map((field) => body[field]),
      );
      const id = get("SELECT last_insert_rowid() as id").id;
      res.status(201).json(toCamel(get(`SELECT * FROM ${table} WHERE id = ?`, [id]), fieldMap));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
