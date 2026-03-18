import * as vscode from 'vscode';
import { minifyCpp, minifyJavascript } from './minify';

type MinifyFn = (input: string) => string;

function registerMinifyCommand(
  context: vscode.ExtensionContext,
  commandId: string,
  minifyFn: MinifyFn
): void {
  const disposable = vscode.commands.registerCommand(commandId, async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('Code Golf: No active editor.');
      return;
    }

    const doc = editor.document;
    const original = doc.getText();
    const minified = minifyFn(original);

    if (minified === original) {
      vscode.window.showInformationMessage('Code Golf: No changes needed.');
      return;
    }

    const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(original.length));

    await editor.edit((editBuilder) => {
      editBuilder.replace(fullRange, minified);
    });
  });

  context.subscriptions.push(disposable);
}

export function activate(context: vscode.ExtensionContext): void {
  registerMinifyCommand(context, 'codeGolf.minifyCpp', minifyCpp);
  registerMinifyCommand(context, 'codeGolf.minifyJavascript', minifyJavascript);
}

export function deactivate(): void {}
