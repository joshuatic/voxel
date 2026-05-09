import ast
import math
import operator
import re

from app.tools.base import ToolResult


_ALLOWED_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}

_ALLOWED_CONSTANTS = {
    "pi": math.pi,
    "π": math.pi,
    "e": math.e,
    "tau": math.tau,
}

_ALLOWED_FUNCTIONS = {
    "sqrt": math.sqrt,
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "asin": math.asin,
    "acos": math.acos,
    "atan": math.atan,
    "log": math.log10,
    "ln": math.log,
    "floor": math.floor,
    "ceil": math.ceil,
    "abs": abs,
    "round": round,
}


class CalculatorTool:
    id = "calculator"
    name = "Calculator"
    description = "Solves arithmetic, constants, and basic scientific expressions locally."

    def can_handle(self, query: str) -> bool:
        expression = self._strip_command_prefix(query)

        # Require at least one math-ish signal so random words do not trigger calculator.
        has_operator = bool(re.search(r"[+\-*/^%()×÷]", expression))
        has_math_word = bool(
            re.search(
                r"\b(pi|π|tau|sqrt|sin|cos|tan|asin|acos|atan|log|ln|floor|ceil|abs|round|plus|minus|times|divided|over)\b",
                expression.lower(),
            )
        )
        starts_with_calc = query.strip().lower().startswith(("calculate ", "calc ", "what is "))

        if not (has_operator or has_math_word or starts_with_calc):
            return False

        try:
            normalized = self._normalize_expression(expression)
            self._evaluate_expression(normalized)
            return True
        except Exception:
            return False

    def run(self, query: str) -> ToolResult:
        original_expression = self._strip_command_prefix(query)
        expression = self._normalize_expression(original_expression)

        try:
            result = self._evaluate_expression(expression)
            result_text = self._format_number(result)

            return ToolResult(
                ok=True,
                tool_id=self.id,
                title="Calculator",
                content=f"`{original_expression.strip()}` = **{result_text}**",
                debug={
                    "expression_original": original_expression.strip(),
                    "expression_normalized": expression,
                    "result": result,
                    "result_display": result_text,
                },
            )

        except Exception as error:
            return ToolResult(
                ok=False,
                tool_id=self.id,
                title="Calculator Error",
                content=f"Could not calculate `{original_expression.strip()}`.",
                debug={
                    "expression_original": original_expression.strip(),
                    "expression_normalized": expression,
                    "error": str(error),
                    "error_type": type(error).__name__,
                },
            )

    def _strip_command_prefix(self, query: str) -> str:
        expression = query.strip()
        lowered = expression.lower()

        prefixes = [
            "calculate ",
            "calc ",
            "what is ",
            "what's ",
            "solve ",
        ]

        for prefix in prefixes:
            if lowered.startswith(prefix):
                return expression[len(prefix):].strip()

        return expression

    def _normalize_expression(self, expression: str) -> str:
        normalized = expression.strip().lower()

        normalized = normalized.replace("×", "*")
        normalized = normalized.replace("÷", "/")
        normalized = normalized.replace("^", "**")

        normalized = re.sub(r"\bplus\b", "+", normalized)
        normalized = re.sub(r"\bminus\b", "-", normalized)
        normalized = re.sub(r"\btimes\b", "*", normalized)
        normalized = re.sub(r"\bmultiplied by\b", "*", normalized)
        normalized = re.sub(r"\bdivided by\b", "/", normalized)
        normalized = re.sub(r"\bover\b", "/", normalized)

        # Treat "x" as multiplication when used like normal spoken math.
        # Example: pi x 3 + 88
        normalized = re.sub(r"\bx\b", "*", normalized)

        # Remove commas in numbers: 1,000 -> 1000
        normalized = re.sub(r"(?<=\d),(?=\d)", "", normalized)

        # Implicit multiplication:
        # 2pi -> 2*pi
        # 2(3+4) -> 2*(3+4)
        # pi(2) -> pi*(2)
        # )( -> )*(
        normalized = re.sub(r"(\d)(pi|π|tau|e)\b", r"\1*\2", normalized)
        normalized = re.sub(r"(\d|\)|pi|π|tau|e)\s*\(", r"\1*(", normalized)
        normalized = re.sub(r"\)\s*(\d|pi|π|tau|e)", r")*\1", normalized)

        # Keep only safe characters/letters used by functions/constants.
        if not re.fullmatch(r"[0-9a-zπ+\-*/%.(),\s]+", normalized):
            raise ValueError("Expression contains unsupported characters.")

        return normalized

    def _evaluate_expression(self, expression: str) -> int | float:
        tree = ast.parse(expression, mode="eval")
        return self._eval_node(tree.body)

    def _eval_node(self, node) -> int | float:
        if isinstance(node, ast.Constant):
            if isinstance(node.value, (int, float)):
                return node.value

            raise ValueError("Only numbers are allowed.")

        if isinstance(node, ast.Name):
            if node.id in _ALLOWED_CONSTANTS:
                return _ALLOWED_CONSTANTS[node.id]

            raise ValueError(f"Unknown constant: {node.id}")

        if isinstance(node, ast.BinOp):
            operator_type = type(node.op)
            operation = _ALLOWED_OPERATORS.get(operator_type)

            if operation is None:
                raise ValueError(f"Unsupported operator: {operator_type.__name__}")

            return operation(
                self._eval_node(node.left),
                self._eval_node(node.right),
            )

        if isinstance(node, ast.UnaryOp):
            operator_type = type(node.op)
            operation = _ALLOWED_OPERATORS.get(operator_type)

            if operation is None:
                raise ValueError(f"Unsupported unary operator: {operator_type.__name__}")

            return operation(self._eval_node(node.operand))

        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name):
                raise ValueError("Only named functions are allowed.")

            function = _ALLOWED_FUNCTIONS.get(node.func.id)

            if function is None:
                raise ValueError(f"Unsupported function: {node.func.id}")

            args = [self._eval_node(arg) for arg in node.args]

            return function(*args)

        raise ValueError(f"Unsupported expression node: {type(node).__name__}")

    def _format_number(self, value: int | float) -> str:
        if isinstance(value, float):
            if value.is_integer():
                return str(int(value))

            return f"{value:.12g}"

        return str(value)