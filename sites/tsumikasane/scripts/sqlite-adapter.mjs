import { DatabaseSync } from 'node:sqlite';
export function sqliteAdapter(path=':memory:'){
  const db=new DatabaseSync(path);
  function prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},run(){const statement=db.prepare(sql);if(/^\s*(SELECT|WITH)\b/i.test(sql)||/RETURNING/i.test(sql))return {results:statement.all(...args)};return {results:[],meta:statement.run(...args)};}};}
  return {prepare,async batch(statements){db.exec('BEGIN');try{const results=statements.map(s=>s.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}},exec:sql=>db.exec(sql),close:()=>db.close()};
}
