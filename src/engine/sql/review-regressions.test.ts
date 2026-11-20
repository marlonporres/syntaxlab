import { expect,it } from 'vitest';
import { analyzeSql } from './analyze';
import { lexSql } from './lexer';

it('clasifica el nombre de tabla tras INTO como identificador y las llamadas como funciones',()=>{
 const source='INSERT INTO /* tabla */ Usuarios /* columnas */ (nombre) SELECT left(nombre, 1)';
 const {tokens}=lexSql(source);
 expect(tokens.find(t=>t.lexeme==='Usuarios')?.category).toBe('identifier');
 expect(tokens.find(t=>t.lexeme==='left')?.category).toBe('function');
 expect(analyzeSql(source).accepted).toBe(true);
});
it('vincula el nodo SELECT de un INSERT solo con el fragmento SELECT real',()=>{
 const source="INSERT INTO Usuarios (nombre)\r\nSELECT left('Ana',1) AS inicial;";
 const result=analyzeSql(source);expect(result.accepted).toBe(true);
 const selection=result.astTree!.children.find(node=>node.label==='SELECT')!;
 expect(source.slice(selection.start,selection.end)).toBe("SELECT left('Ana',1) AS inicial");
 expect(selection).toMatchObject({line:2,column:1,start:source.indexOf('SELECT')});
});
